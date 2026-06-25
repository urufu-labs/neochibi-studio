export interface TraitAsset {
  id: string;
  name: string;
  relativePath: string;
  extension: string;
  version: number;
}

export interface TraitLayer {
  id: string;
  name: string;
  directoryName: string;
  traits: TraitAsset[];
}

export interface TraitLibrary {
  rootDir: string;
  layers: TraitLayer[];
}
