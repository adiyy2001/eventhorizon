import { type RenderSettings } from '../../core/render/settings';

const toDegrees = (radians: number): number => Math.round((radians * 180) / Math.PI);

function onOff(enabled: boolean): string {
  return enabled ? 'on' : 'off';
}

export function cameraAnnouncement(settings: RenderSettings): string {
  const { view } = settings;
  return `Inclination ${String(toDegrees(view.inclination))} degrees, azimuth ${String(toDegrees(view.azimuth))} degrees, distance ${String(Math.round(view.distance * 10) / 10)} M.`;
}

export function effectsDescription(settings: RenderSettings): string {
  const { view } = settings;
  return `Lensing ${onOff(view.lensing)}, Doppler beaming ${onOff(view.doppler)}, gravitational redshift ${onOff(view.gravitationalRedshift)}, higher-order images ${onOff(view.higherOrderImages)}.`;
}

function overlaysDescription(settings: RenderSettings): string {
  const names = [
    settings.overlays.photonSphere ? 'photon sphere' : null,
    settings.overlays.isco ? 'innermost stable orbit' : null,
    settings.overlays.shadowEdge ? 'shadow edge' : null,
  ].filter((name) => name !== null);
  return names.length === 0 ? 'No overlays.' : `Overlays: ${names.join(', ')}.`;
}

export function canvasDescription(settings: RenderSettings): string {
  const { view } = settings;
  const split = settings.split.enabled
    ? ` Split view at ${String(Math.round(settings.split.position * 100))} percent: selected effects on the left, the full model on the right.`
    : '';
  return `Schwarzschild black hole with an accretion disk, rendered by ray tracing. ${cameraAnnouncement(settings)} Disk outer radius ${String(Math.round(view.diskOuterRadius * 10) / 10)} M, peak temperature ${String(Math.round(view.peakTemperature))} K. ${effectsDescription(settings)} ${overlaysDescription(settings)}${split}`;
}
