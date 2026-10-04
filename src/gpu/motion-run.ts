import { mergeSettings, type RenderSettings } from '../core/render/settings';
import { type ResolutionLogEntry } from './dynamic-resolution';
import { type FrameScheduler, type LoopRenderer, RenderLoop } from './render-loop';

export interface MotionPlan {
  restFrames: number;
  moveFrames: number;
  settleFrames: number;
  azimuthStep: number;
}

export const defaultMotionPlan: MotionPlan = {
  restFrames: 3,
  moveFrames: 24,
  settleFrames: 10,
  azimuthStep: 0.02,
};

export function runMotionPlan(
  renderer: LoopRenderer,
  scheduler: FrameScheduler,
  settings: RenderSettings,
  plan: MotionPlan = defaultMotionPlan,
): Promise<ResolutionLogEntry[]> {
  return new Promise((resolve) => {
    const moveEnd = plan.restFrames + plan.moveFrames;
    const total = moveEnd + plan.settleFrames;
    const loop: RenderLoop = new RenderLoop(renderer, scheduler, settings, {
      onFrame: (_, entry) => {
        const next = entry.frame + 1;
        if (next >= total) {
          loop.stop();
          resolve([...loop.log]);
          return;
        }
        if (next >= plan.restFrames && next < moveEnd) {
          const step = next - plan.restFrames + 1;
          loop.setSettings(
            mergeSettings(settings, {
              view: { azimuth: settings.view.azimuth + plan.azimuthStep * step },
            }),
          );
        }
      },
    });
    loop.start();
  });
}
