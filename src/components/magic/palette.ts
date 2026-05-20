export const palette = {
  paper: '#FBF5E6',
  paperDeep: '#F4EAD0',
  paperShadow: '#E8DDC0',
  ink: '#3D3326',
  inkSoft: '#6B5D4A',
  inkPale: '#A89A82',
  rose: '#F2C7C1',
  roseDeep: '#D89991',
  butter: '#F4DFA5',
  butterDeep: '#D9B863',
  mint: '#C9DFC8',
  mintDeep: '#7FA77E',
  sky: '#C8D8E4',
  skyDeep: '#6E92A8',
  lilac: '#D8CCE0',
  lilacDeep: '#A187B5',
  peach: '#F4D2B5',
  peachDeep: '#D49A6A',
  catFur: '#FAF6EE',
  catShadow: '#E2D9C8',
  catGray: '#9E9586',
  catGrayDeep: '#6E665A',
  catPink: '#E4ADA8',
  ember: '#E47B5A',
} as const;

export type PaletteKey = keyof typeof palette;

