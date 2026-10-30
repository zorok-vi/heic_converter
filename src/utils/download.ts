export class Downloads {
  private links = new Map<string, ReturnType<typeof setTimeout>>();
  save(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = name;
    document.body.append(anchor); anchor.click(); anchor.remove();
    this.links.set(url, setTimeout(() => { URL.revokeObjectURL(url); this.links.delete(url); }, 60_000));
  }
  clear(): void {
    for (const [url, timer] of this.links) { clearTimeout(timer); URL.revokeObjectURL(url); }
    this.links.clear();
  }
}
