// Encodes audio into a groove off the main thread, streaming the cut points back so the
// Studio can draw the spiral as it's being made. Then decodes it back for playback.
import { encodeToSVG, encodeLossless, decodeFromSVG } from './codec.js';

self.onmessage = ({ data: { left, right, opts, geom, lossless } }) => {
  try {
    const hooks = {
      onStage: stage => self.postMessage({ type: 'stage', stage }),
      onPoints: (from, to, pts) => {
        if (from === 0) self.postMessage({ type: 'start', total: pts.length / 2 });
        const slice = pts.slice(from * 2, to * 2);
        self.postMessage({ type: 'points', from, to, pts: slice }, [slice.buffer]);
      },
    };
    const { svg, groovePoints, debugMsg } = lossless
      ? encodeLossless(left, right, { ...opts, ...hooks })
      : encodeToSVG(left, { ...opts, rightChannel: right, ...hooks });
    self.postMessage({ type: 'stage', stage: 'Verifying' });
    const d = decodeFromSVG(svg, geom);
    // Master quality: prove it. Every decoded sample must equal the source sample.
    let verified = null;
    if (lossless) {
      verified = d.intL.length === left.length;
      for (let i = 0; verified && i < left.length; i++) {
        if (d.intL[i] !== left[i] || (right && d.intR[i] !== right[i])) verified = false;
      }
      if (!verified) throw new Error('Master pressing failed its bit-exact check');
    }
    const transfer = [groovePoints.buffer, d.samples.buffer, d.samplesR?.buffer, d.intL?.buffer, d.intR?.buffer].filter(Boolean);
    self.postMessage({
      type: 'done', svg, groovePoints, debugMsg, verified,
      samples: d.samples, samplesR: d.samplesR || null, sampleRate: d.sampleRate,
      ints: lossless ? { intL: d.intL, intR: d.intR || null, bits: d.bits } : null,
    }, [...new Set(transfer)]);
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
};
