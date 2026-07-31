/**
 * Manual verification for the delete-stream JW teardown fix.
 *
 * Polls JW Player's own Live Broadcast API directly (bypassing this app
 * entirely) to confirm that a stream deleted through the admin UI / API
 * actually tears down on JW's side and never comes back — the exact failure
 * this script exists to catch: the old code deleted /media/{id}/, which
 * looked like success but left the live channel fully configured, so it
 * reappeared as "Starting Soon" and later "LIVE" at its scheduled time.
 *
 * How to use:
 *   1. In the admin UI, create a disposable test stream (a real one — JW
 *      channel creation is what we're testing the teardown of).
 *   2. Delete it through the admin UI (or `curl -X DELETE /api/delete-stream`)
 *      exactly as a real user would.
 *   3. Immediately run this script against the same site/stream:
 *        node scripts/verify-stream-deletion.mjs <jw_site_id> <jw_api_secret> <stream_id>
 *
 * What it checks:
 *   - Polls GET /live/broadcast/streams/{id}/ every 30s for up to 20 minutes,
 *     expecting the status to move through "destroying" and then 404.
 *   - Once it 404s, rechecks every minute for 15 more minutes to confirm the
 *     channel never reappears (the original bug's exact symptom — it came
 *     back "Starting Soon" minutes later still counting down to its
 *     originally scheduled start time).
 *
 * Exits 0 (PASS) only if the channel disappears and stays gone for the full
 * recheck window; exits 1 (FAIL) with the observed state otherwise.
 */

const POLL_INTERVAL_MS      = 30_000
const POLL_TIMEOUT_MS       = 20 * 60_000
const RECHECK_INTERVAL_MS   = 60_000
const RECHECK_WINDOW_MS     = 15 * 60_000

const [, , siteId, apiSecret, streamId] = process.argv
if (!siteId || !apiSecret || !streamId) {
  console.error('Usage: node scripts/verify-stream-deletion.mjs <jw_site_id> <jw_api_secret> <stream_id>')
  process.exit(1)
}

const url = `https://api.jwplayer.com/v2/sites/${siteId}/live/broadcast/streams/${encodeURIComponent(streamId)}/`

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function checkOnce() {
  const r = await fetch(url, { headers: { Authorization: apiSecret, Accept: 'application/json' } })
  if (r.status === 404) return { gone: true, status: 404 }
  if (!r.ok) {
    const body = await r.text()
    throw new Error(`Unexpected JW response ${r.status}: ${body}`)
  }
  const data = await r.json()
  return { gone: false, status: data.metadata?.status || 'unknown' }
}

async function main() {
  console.log(`Polling ${url}`)
  console.log('Waiting for the channel to disappear (up to 20 minutes)...')

  const deadline = Date.now() + POLL_TIMEOUT_MS
  let lastStatus = null
  while (Date.now() < deadline) {
    const result = await checkOnce()
    if (result.gone) {
      console.log('✔ Channel is gone from JW (404). Now confirming it stays gone...')
      break
    }
    if (result.status !== lastStatus) {
      console.log(`  still present — metadata.status = "${result.status}"`)
      lastStatus = result.status
    }
    await sleep(POLL_INTERVAL_MS)
  }

  if (lastStatus !== null && Date.now() >= deadline) {
    console.error(`✘ FAIL — channel never disappeared within ${POLL_TIMEOUT_MS / 60_000} minutes (last status: "${lastStatus}").`)
    console.error('  This is the original bug: the channel config was never torn down and will go live at its scheduled time.')
    process.exit(1)
  }

  const recheckDeadline = Date.now() + RECHECK_WINDOW_MS
  while (Date.now() < recheckDeadline) {
    await sleep(RECHECK_INTERVAL_MS)
    const result = await checkOnce()
    if (!result.gone) {
      console.error(`✘ FAIL — channel REAPPEARED with metadata.status = "${result.status}". This is the exact orphan-channel regression.`)
      process.exit(1)
    }
    console.log('  ...still gone')
  }

  console.log(`✔ PASS — channel stayed deleted for the full ${RECHECK_WINDOW_MS / 60_000}-minute recheck window.`)
}

main().catch(err => {
  console.error('Failed:', err.message)
  process.exit(1)
})
