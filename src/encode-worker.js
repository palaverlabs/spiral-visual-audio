// Encodes audio into a groove off the main thread, streaming the cut points back so the
// Studio can draw the spiral as it's being made. Then decodes it back for playback.
import { encodeToSVG, decodeFromSVG } from './codec.js';

self.onmessage = ({ data: { left, right, opts, geom } }) => {
  try {
    const { svg, groovePoints, debugMsg } = encodeToSVG(left, {
      ...opts,
      rightChannel: right,
      onStage: stage => self.postMessage({ type: 'stage', stage }),
      onPoints: (from, to, pts) => {
        if (from === 0) self.postMessage({ type: 'start', total: pts.length / 2 });
        const slice = pts.slice(from * 2, to * 2);
        self.postMessage({ type: 'points', from, to, pts: slice }, [slice.buffer]);
      },
    });
    self.postMessage({ type: 'stage', stage: 'Verifying' });
    const d = decodeFromSVG(svg, geom);
    const transfer = [groovePoints.buffer, d.samples.buffer, d.samplesR?.buffer].filter(Boolean);
    self.postMessage({ type: 'done', svg, groovePoints, debugMsg, samples: d.samples, samplesR: d.samplesR || null, sampleRate: d.sampleRate }, transfer);
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
};
