import type { Orientation } from '../types'

export interface Parts {
  date: string
  time: string
}

export declare function classify(aspect: number): Orientation
export declare function toLocalParts(value: unknown): Parts | null
export declare function tidy(n: number, digits?: number): string
export declare function formatCamera(make?: string | null, model?: string | null): string | null
export declare function formatFocal(focal?: number | null): string | null
export declare function formatExposure(seconds?: number | null): string | null

export interface RawExif {
  Make?: string | null
  Model?: string | null
  LensModel?: string | null
  FocalLength?: number | null
  FNumber?: number | null
  ExposureTime?: number | null
  ISO?: number | null
}

export declare function buildPhotoRecord(input: {
  id: string
  album: string
  taken: Parts
  width: number
  height: number
  viewPath: string
  thumbPath: string
  viewBytes: number
  thumbBytes: number
  lqip: string
  color: string
  exif: RawExif
}): Record<string, unknown>

export declare function mergeManifest<T>(
  manifest: { photos?: T[] } | null | undefined,
  records: T[]
): { generatedAt: string; count: number; dates: string[]; photos: T[] }
