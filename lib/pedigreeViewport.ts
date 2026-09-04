export interface PedigreeViewportSize {
  width: number;
  height: number;
}

export interface PedigreeFocusRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Keep the focused card visible when a wide descendant branch is first rendered. */
export const centeredPedigreeScrollPosition = (
  focusRect: PedigreeFocusRect,
  content: PedigreeViewportSize,
  viewport: PedigreeViewportSize
) => {
  const desiredLeft = focusRect.left + focusRect.width / 2 - viewport.width / 2;
  const desiredTop = focusRect.top + focusRect.height / 2 - viewport.height / 2;

  return {
    left: Math.max(0, Math.min(desiredLeft, Math.max(0, content.width - viewport.width))),
    top: Math.max(0, Math.min(desiredTop, Math.max(0, content.height - viewport.height))),
  };
};
