'use strict';

/**
 * Minimal SCTE-35 splice_info_section scanner for MPEG-TS segments.
 * Scans each 188-byte TS packet for a payload-unit-start that begins a
 * section with table_id 0xFC (SCTE-35), and parses just enough fields to
 * be useful for an eval script. Sections that span multiple TS packets
 * are not reassembled (single-packet sections only) -- good enough since
 * splice_info_sections are almost always small enough to fit in one packet.
 */

const TS_PACKET_SIZE = 188;
const SCTE35_TABLE_ID = 0xfc;

function commandName(type) {
  switch (type) {
    case 0x00:
      return 'splice_null';
    case 0x04:
      return 'splice_schedule';
    case 0x05:
      return 'splice_insert';
    case 0x06:
      return 'time_signal';
    case 0x07:
      return 'bandwidth_reservation';
    case 0xff:
      return 'private_command';
    default:
      return `unknown(0x${type.toString(16)})`;
  }
}

function parseSpliceInfoSection(buf, offset) {
  if (buf[offset] !== SCTE35_TABLE_ID) return null;

  let pos = offset;
  const table_id = buf[pos];
  pos += 1;

  const b1 = buf[pos];
  pos += 1;
  const section_length = ((b1 & 0x0f) << 8) | buf[pos];
  pos += 1;

  const sectionEnd = offset + 3 + section_length;
  if (sectionEnd > buf.length) return null; // section continues past this packet, skip

  const protocol_version = buf[pos];
  pos += 1;

  const b2 = buf[pos];
  pos += 1;
  const encrypted_packet = !!((b2 >> 7) & 0x1);

  // pts_adjustment is 33 bits; skip it (not needed for a simple print-out)
  pos += 4;

  pos += 1; // cw_index

  const b3 = buf[pos];
  const b4 = buf[pos + 1];
  pos += 2;
  const tier = (b3 << 4) | (b4 >> 4);

  const splice_command_length = ((b4 & 0x0f) << 8) | buf[pos];
  pos += 1;

  const splice_command_type = buf[pos];
  pos += 1;

  const result = {
    table_id,
    section_length,
    protocol_version,
    encrypted_packet,
    tier,
    splice_command_type,
    splice_command_name: commandName(splice_command_type),
  };

  if (splice_command_type === 0x05 && pos + 5 <= buf.length) {
    // splice_insert
    const splice_event_id = buf.readUInt32BE(pos);
    pos += 4;
    const b5 = buf[pos];
    pos += 1;
    const splice_event_cancel_indicator = !!((b5 >> 7) & 0x1);

    result.splice_event_id = splice_event_id;
    result.splice_event_cancel_indicator = splice_event_cancel_indicator;

    if (!splice_event_cancel_indicator && pos < buf.length) {
      const b6 = buf[pos];
      result.out_of_network_indicator = !!((b6 >> 7) & 0x1);
      result.program_splice_flag = !!((b6 >> 6) & 0x1);
      result.duration_flag = !!((b6 >> 5) & 0x1);
      result.splice_immediate_flag = !!((b6 >> 4) & 0x1);
    }
  }

  return result;
}

function findScte35InTs(buf) {
  const results = [];

  for (let i = 0; i + TS_PACKET_SIZE <= buf.length; i += TS_PACKET_SIZE) {
    if (buf[i] !== 0x47) continue; // not a valid TS sync byte

    const b1 = buf[i + 1];
    const payloadUnitStart = !!((b1 >> 6) & 0x1);
    if (!payloadUnitStart) continue;

    const b3 = buf[i + 3];
    const adaptationFieldControl = (b3 >> 4) & 0x3;
    if (adaptationFieldControl === 2) continue; // adaptation field only, no payload

    let payloadStart = i + 4;
    if (adaptationFieldControl === 3) {
      const adaptationLength = buf[payloadStart];
      payloadStart += 1 + adaptationLength;
    }
    if (payloadStart >= i + TS_PACKET_SIZE) continue;

    const pointerField = buf[payloadStart];
    const sectionStart = payloadStart + 1 + pointerField;
    if (sectionStart >= i + TS_PACKET_SIZE) continue;

    if (buf[sectionStart] === SCTE35_TABLE_ID) {
      const parsed = parseSpliceInfoSection(buf, sectionStart);
      if (parsed) results.push(parsed);
    }
  }

  return results;
}

module.exports = { findScte35InTs, parseSpliceInfoSection };
