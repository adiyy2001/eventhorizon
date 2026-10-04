export interface PostSettings {
  exposure: number;
  bloomStrength: number;
  ditherAmplitude: number;
}

export const defaultPost: PostSettings = {
  exposure: 0,
  bloomStrength: 0.06,
  ditherAmplitude: 1,
};
