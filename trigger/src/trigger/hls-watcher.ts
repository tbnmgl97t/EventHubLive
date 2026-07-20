import { logger, task } from "@trigger.dev/sdk/v3";
import * as http from "node:http";
import * as https from "node:https";
import * as fs from "node:fs";
import { findScte35InTs, parseSpliceInfoSection } from "./scte35";
import { findHlsStreamByTaskId, insertHlsParserEvent } from "./supabase";

/**
 * HLS tag + segment watcher.
 * Polls an HLS playlist URL, resolves master -> media playlist if needed,
 * logs any new #EXT tag lines, and downloads + scans each new segment
 * for in-band SCTE-35 markers (not just what's signaled in the playlist).
 *
 * Every run looks itself up in Supabase's hls_streams table by current_task_id
 * (a separate Next.js app owns that table entirely -- creating rows and
 * setting current_task_id to this run's ID before/when it triggers this
 * task) purely to read tenant_id for attributing this run's events; it never
 * writes to hls_streams. Every tag/segment event is written as its own row
 * in hls_parser_events, tagged with tenant_id and task_id (this run's ID). If
 * no hls_streams row matches, this just logs a warning and watches the
 * stream anyway, skipping all hls_parser_events writes for the run.
 *
 * `payload.duration` only controls this task's own graceful poll loop below
 * (it actually stops itself a minute early, at `duration - 60s`, then closes
 * outFile and returns a summary). It does NOT set this run's trigger.dev
 * maxDuration -- the caller does that separately via
 * tasks.trigger(id, payload, { maxDuration }), as a safety-net ceiling above
 * `duration` in case this loop never returns. If maxDuration is hit instead,
 * trigger.dev hard-kills the run and skips all of this file's own cleanup/
 * return value. See https://trigger.dev/docs/runs/max-duration
 */

type HlsWatcherPayload = {
  url: string;
  /** Poll interval in seconds. Defaults to the playlist's EXT-X-TARGETDURATION, or 4s. */
  interval?: number;
  /** Stop 1 minute before this many seconds elapse, to exit gracefully with headroom. If omitted, runs until the task's maxDuration is hit. */
  duration?: number;
  /** Only track these tag names, e.g. ["EXT-X-CUE-OUT", "EXT-X-DATERANGE"]. Defaults to all #EXT-X-* tags. */
  tags?: string[];
  /** If set, also append every event as JSON (one per line) to this file path. */
  outFile?: string;
};

function fetchText(targetUrl: string): Promise<{ data: string; finalUrl: string }> {
  return new Promise((resolve, reject) => {
    const lib = targetUrl.startsWith("https") ? https : http;
    lib
      .get(targetUrl, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(fetchText(new URL(res.headers.location, targetUrl).toString()));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${targetUrl}`));
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ data, finalUrl: targetUrl }));
      })
      .on("error", reject);
  });
}

function fetchBuffer(targetUrl: string): Promise<{ data: Buffer; finalUrl: string }> {
  return new Promise((resolve, reject) => {
    const lib = targetUrl.startsWith("https") ? https : http;
    lib
      .get(targetUrl, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(fetchBuffer(new URL(res.headers.location, targetUrl).toString()));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${targetUrl}`));
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ data: Buffer.concat(chunks), finalUrl: targetUrl }));
      })
      .on("error", reject);
  });
}

// If this is a master playlist, pick the first variant and switch to it.
async function resolveMediaPlaylistUrl(playlistUrl: string): Promise<{ mediaUrl: string; text: string }> {
  const { data: text, finalUrl } = await fetchText(playlistUrl);
  const lines = text.split("\n").map((l) => l.trim());

  const isMaster = lines.some((l) => l.startsWith("#EXT-X-STREAM-INF"));
  if (!isMaster) {
    return { mediaUrl: finalUrl, text };
  }

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
      const variantUri = lines[i + 1];
      if (variantUri && !variantUri.startsWith("#")) {
        const mediaUrl = new URL(variantUri, finalUrl).toString();
        logger.log(`Master playlist detected. Switching to variant: ${mediaUrl}`);
        return resolveMediaPlaylistUrl(mediaUrl);
      }
    }
  }

  throw new Error("Master playlist found but no variant URI could be resolved.");
}

function extractTags(playlistText: string): string[] {
  return playlistText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("#EXT"));
}

// Live playlists shouldn't be reloaded more often than their own target
// duration -- that's how frequently new segments actually show up.
function extractTargetDuration(playlistText: string): number | null {
  const match = playlistText.match(/#EXT-X-TARGETDURATION:(\d+)/);
  return match ? Number(match[1]) : null;
}

// Some streams only signal SCTE-35 via EXT-X-DATERANGE hex attributes
// (SCTE35-OUT / SCTE35-IN / SCTE35-CMD) rather than in-band in segments.
// Decode those with the same splice_info_section parser.
function decodeDateRangeScte35(tagLine: string): Array<{ attr: string } & Record<string, unknown>> {
  if (!tagLine.startsWith("#EXT-X-DATERANGE")) return [];

  const results: Array<{ attr: string } & Record<string, unknown>> = [];
  const re = /(SCTE35-OUT|SCTE35-IN|SCTE35-CMD)=0x([0-9A-Fa-f]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tagLine)) !== null) {
    const [, attr, hex] = match;
    const buf = Buffer.from(hex, "hex");
    const parsed = parseSpliceInfoSection(buf, 0);
    if (parsed) {
      results.push({ attr, ...parsed });
    }
  }
  return results;
}

function extractSegmentUris(playlistText: string, playlistUrl: string): string[] {
  return playlistText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .map((uri) => new URL(uri, playlistUrl).toString());
}

function tagIsTracked(tagLine: string, tagFilter: string[] | null): boolean {
  if (!tagFilter) return true;
  return tagFilter.some((name) => tagLine === name || tagLine.startsWith(`${name}:`));
}

export const hlsWatcherTask = task({
  id: "hls-watcher",
  maxDuration: 3600,
  run: async (payload: HlsWatcherPayload, { ctx }) => {
    const { url, interval: intervalArg, duration: durationArg, outFile } = payload;
    const taskId = ctx.run.id;

    logger.log("hls-watcher run starting", { runId: taskId, payload });

    if (!url) {
      throw new Error("payload.url is required");
    }

    const tagFilter = payload.tags?.length
      ? payload.tags.map((t) => (t.startsWith("#") ? t : `#${t}`))
      : null;

    const seenTags = new Set<string>();
    const seenSegments = new Set<string>();
    const events: Record<string, unknown>[] = [];
    const outStream = outFile ? fs.createWriteStream(outFile, { flags: "a" }) : null;

    // Look this run up in hls_streams purely to get tenant_id for attributing
    // this run's hls_parser_events rows. The row is expected to already
    // exist -- see the module doc comment above.
    logger.log(`Looking up hls_streams row by current_task_id = ${taskId}`);
    const stream = await findHlsStreamByTaskId(taskId);
    if (stream) {
      logger.log(`hls_streams row matched -- hls_parser_events writes are ON for this run`, {
        streamId: stream.id,
        streamName: stream.name,
        tenantId: stream.tenant_id,
      });
    } else {
      logger.warn(`No hls_streams row has current_task_id ${taskId} -- skipping hls_parser_events writes for this run`);
    }

    function emit(event: Record<string, unknown>): Record<string, unknown> {
      const record: Record<string, unknown> = { timestamp: new Date().toISOString(), ...event };
      events.push(record);
      if (outStream) {
        outStream.write(JSON.stringify(record) + "\n");
      }
      if (stream) {
        insertHlsParserEvent({
          tenantId: stream.tenant_id,
          taskId,
          type: record.type as string,
          occurredAt: record.timestamp as string,
          payload: record,
        }).then(
          () => logger.log(`hls_parser_events row written`, { type: record.type, streamId: stream.id }),
          (err) => logger.error("Failed to write hls_parser_events row", { error: (err as Error).message, type: record.type }),
        );
      }
      return record;
    }

    async function processSegment(segmentUrl: string) {
      try {
        const { data: buf } = await fetchBuffer(segmentUrl);
        const markers = findScte35InTs(buf);
        emit({ type: "segment", url: segmentUrl, bytes: buf.length, scte35: markers });

        if (markers.length === 0) {
          logger.log(`segment: ${segmentUrl} (${buf.length} bytes, no SCTE-35 found)`);
        } else {
          logger.log(`segment: ${segmentUrl} (${buf.length} bytes)`, { markers });
        }
      } catch (err) {
        logger.error(`Error fetching segment ${segmentUrl}`, { error: (err as Error).message });
      }
    }

    let pollCount = 0;

    async function poll(mediaUrl: string) {
      pollCount += 1;
      logger.log(`poll #${pollCount}: fetching playlist`, { mediaUrl });
      try {
        const { data: text, finalUrl } = await fetchText(mediaUrl);
        logger.log(`poll #${pollCount}: playlist fetched`, { bytes: text.length });

        const tags = extractTags(text).filter((t) => tagIsTracked(t, tagFilter));
        let newTagCount = 0;
        for (const tag of tags) {
          if (!seenTags.has(tag)) {
            seenTags.add(tag);
            newTagCount += 1;
            const markers = decodeDateRangeScte35(tag);
            emit({ type: "tag", tag, scte35: markers });
            logger.log(tag, { markers });
          }
        }

        const segmentUrls = extractSegmentUris(text, finalUrl);
        let newSegmentCount = 0;
        for (const segmentUrl of segmentUrls) {
          if (!seenSegments.has(segmentUrl)) {
            seenSegments.add(segmentUrl);
            newSegmentCount += 1;
            await processSegment(segmentUrl);
          }
        }

        logger.log(`poll #${pollCount}: cycle complete`, {
          newTags: newTagCount,
          newSegments: newSegmentCount,
          totalTagsSeen: seenTags.size,
          totalSegmentsSeen: seenSegments.size,
          totalEventsEmitted: events.length,
        });
      } catch (err) {
        logger.error(`poll #${pollCount}: error fetching playlist`, { error: (err as Error).message });
      }
    }

    logger.log(`Resolving media playlist`, { url });
    const { mediaUrl, text: initialText } = await resolveMediaPlaylistUrl(url);
    logger.log(`Media playlist resolved`, { mediaUrl });

    const targetDuration = extractTargetDuration(initialText);
    const pollInterval = intervalArg || targetDuration || 4;
    if (!intervalArg && targetDuration) {
      logger.log(`Using EXT-X-TARGETDURATION (${targetDuration}s) as the poll interval.`);
    }
    if (outFile) {
      logger.log(`Writing JSON events to ${outFile}`);
    }
    if (tagFilter) {
      logger.log(`Tracking only these tags: ${tagFilter.join(", ")}`);
    }

    // Stop polling a minute before the requested duration, not at it -- this
    // leaves headroom for the graceful-shutdown work below (closing outFile,
    // returning the events summary) to finish comfortably before the
    // caller's platform-enforced maxDuration safety net (duration + 30s,
    // see api/hls-watcher-streams.js in the main app repo) could hard-kill
    // the run mid-cleanup. Durations under a minute just stop after the
    // first poll rather than going negative.
    const GRACEFUL_STOP_BUFFER_SECONDS = 60;
    const effectiveDuration =
      durationArg !== undefined ? Math.max(durationArg - GRACEFUL_STOP_BUFFER_SECONDS, 0) : undefined;

    const stopMessage =
      effectiveDuration !== undefined
        ? `for ${effectiveDuration}s (1 minute before the requested ${durationArg}s, to exit gracefully)`
        : "until this task's maxDuration is reached";
    logger.log(`Watching ${mediaUrl} every ${pollInterval}s, ${stopMessage}.`);

    await poll(mediaUrl);

    const startTime = Date.now();
    const endTime = effectiveDuration !== undefined ? startTime + effectiveDuration * 1000 : null;
    while (!endTime || Date.now() < endTime) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval * 1000));
      await poll(mediaUrl);
    }

    logger.log(`Graceful stop reached after ${Math.round((Date.now() - startTime) / 1000)}s`, {
      pollCount,
      totalTagsSeen: seenTags.size,
      totalSegmentsSeen: seenSegments.size,
      totalEventsEmitted: events.length,
    });

    if (outStream) {
      logger.log(`Closing outFile`, { outFile });
      await new Promise<void>((resolve) => outStream.end(() => resolve()));
    }

    const summary = { mediaUrl, eventCount: events.length, events };
    logger.log("hls-watcher run finished", { mediaUrl, eventCount: events.length });
    return summary;
  },
});
