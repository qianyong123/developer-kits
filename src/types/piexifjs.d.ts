declare module 'piexifjs' {
  interface Piexif {
    load(jpegData: string): Record<string, unknown>;
    dump(exifObj: Record<string, unknown>): string;
    insert(exifStr: string, jpegData: string): string;
    remove(jpegData: string): string;
  }

  const piexif: Piexif;
  export default piexif;
}
