export function devToolsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_STUDIO !== '0';
}
