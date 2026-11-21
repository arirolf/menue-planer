// Camera barcode scanning, loaded with import() only when the scanner opens.
// Uses the browser's BarcodeDetector where it exists (Android Chrome) and the
// barcode-detector ponyfill (zxing WASM) elsewhere, e.g. on iPhones.
import { BarcodeDetector as Ponyfill, prepareZXingModule } from 'barcode-detector/ponyfill';
// Served by our own app instead of the default jsDelivr CDN
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const INTERVAL = 150;

let detectorPromise = null;

async function createDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      if (FORMATS.every((f) => supported.includes(f))) return new window.BarcodeDetector({ formats: FORMATS });
    } catch {
      // fall through to the ponyfill
    }
  }
  // Start loading the WASM right away, while the camera starts
  prepareZXingModule({
    overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
    fireImmediately: true,
  });
  return new Ponyfill({ formats: FORMATS });
}

// Error with a kind the UI turns into a friendly text:
// 'insecure' (no HTTPS), 'denied', 'nocamera', 'failed'
function cameraError(err) {
  const kind =
    err?.name === 'NotAllowedError' || err?.name === 'SecurityError'
      ? 'denied'
      : err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError'
        ? 'nocamera'
        : 'failed';
  return Object.assign(new Error(kind), { kind });
}

// Starts the back camera in <video> and calls onCode(digits) once for the first
// barcode read; the camera is stopped before that. Returns stop() for closing early.
export async function startScanner(video, onCode) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('insecure'), { kind: 'insecure' });
  }
  detectorPromise ??= createDetector();

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch (err) {
    throw cameraError(err);
  }

  let stopped = false;
  let timer = null;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  };

  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  try {
    await video.play();
  } catch (err) {
    stop();
    throw cameraError(err);
  }

  let detector;
  try {
    detector = await detectorPromise;
  } catch (err) {
    detectorPromise = null;
    stop();
    throw cameraError(err);
  }

  // One detect() at a time; the next one is scheduled after the last finished
  const tick = async () => {
    if (stopped) return;
    try {
      if (video.readyState >= 2) {
        const codes = await detector.detect(video);
        const hit = codes.find((c) => /^\d{6,14}$/.test(c.rawValue));
        if (hit && !stopped) {
          stop();
          navigator.vibrate?.(50);
          onCode(hit.rawValue);
          return;
        }
      }
    } catch {
      // a single bad frame: just try the next one
    }
    if (!stopped) timer = setTimeout(tick, INTERVAL);
  };
  tick();

  return stop;
}
