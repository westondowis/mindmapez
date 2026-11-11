/** A sector has no branch parent: ascending from it remounts the root 3D overview. */
export function branchUpDestination(branchId: string | null, parentId: string | null) {
  return { overview: branchId === null, branchId: branchId === null ? null : parentId };
}

type ScrollAncestor = { style: { overflow: string; overscrollBehavior: string } };
/** Prevent focus and oversized floating content from scrolling either page ancestor. */
export function lockBranchViewport(page: { documentElement: ScrollAncestor; body: ScrollAncestor }) {
  const ancestors = [page.documentElement, page.body];
  const previous = ancestors.map(element => ({ overflow: element.style.overflow, overscrollBehavior: element.style.overscrollBehavior }));
  ancestors.forEach(element => { element.style.overflow = "hidden"; element.style.overscrollBehavior = "none"; });
  return () => ancestors.forEach((element, i) => Object.assign(element.style, previous[i]));
}
