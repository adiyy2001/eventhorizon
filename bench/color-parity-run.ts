import { type Page } from '@playwright/test';
import type { ColorParityResponse } from '../src/app/automation';
import { buildTemperatureLut } from '../src/core/color/temperature-lut';
import {
  buildColorParitySets,
  type ColorParityReport,
  compareColorOutputs,
} from '../src/core/validation/color-parity';

export interface ColorParityRunResult {
  adapter: ColorParityResponse['adapter'];
  shaderMessages: Record<string, unknown[]>;
  reports: ColorParityReport[];
}

export async function runColorParityOnGpu(page: Page): Promise<ColorParityRunResult> {
  const sets = buildColorParitySets(buildTemperatureLut());
  const reports: ColorParityReport[] = [];
  const shaderMessages: Record<string, unknown[]> = {};
  let adapter: ColorParityResponse['adapter'] | undefined;
  for (const set of sets) {
    const response = await page.evaluate(
      async (request) => {
        const automation = window.eventhorizonAutomation;
        if (automation === undefined) {
          throw new Error('automation hook is missing');
        }
        return automation.runColorParity(request);
      },
      { mode: set.mode, inputs: set.inputs, inputsAreUint32: set.inputsAreUint32 },
    );
    adapter = response.adapter;
    shaderMessages[set.mode] = response.messages;
    reports.push(compareColorOutputs(set, response.outputs));
  }
  if (adapter === undefined) {
    throw new Error('no colour parity set ran');
  }
  return { adapter, shaderMessages, reports };
}
