declare module 'd3-force-3d' {
  export function forceCollide(radius?: number | ((node: any) => number)): any;
  export function forceManyBody(): any;
  export function forceLink(links?: any[]): any;
  export function forceCenter(x?: number, y?: number, z?: number): any;
  const d3Force3d: any;
  export default d3Force3d;
}
