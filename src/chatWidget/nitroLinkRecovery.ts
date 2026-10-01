type NitroClickEvent = MouseEvent & {
  nitroPromise?: unknown;
  repeatDefaultIfNeeded?: boolean;
  nitroDefaultPrevented?: boolean;
};

// NitroPack replaces the instance getter after cancelling native navigation.
const nativeDefaultPrevented = Object.getOwnPropertyDescriptor(
  Event.prototype,
  "defaultPrevented"
)?.get;

export function installNitroLinkRecovery(container: HTMLElement | null) {
  const root = container?.getRootNode();
  if (!container || !(root instanceof ShadowRoot)) return;

  const recoverLink = (event: Event) => {
    const click = event as NitroClickEvent;
    if (
      !click.isTrusted ||
      click.button !== 0 ||
      click.shiftKey ||
      click.altKey ||
      click.nitroPromise === undefined ||
      click.repeatDefaultIfNeeded !== true ||
      click.nitroDefaultPrevented !== false ||
      !nativeDefaultPrevented?.call(click)
    ) {
      return;
    }

    // NitroPack caches composedPath outside the closed root, hiding its links.
    const target =
      click.target instanceof Element
        ? click.target
        : click.target instanceof Node
        ? click.target.parentElement
        : null;
    const link = target?.closest("a[href]");
    if (
      !(link instanceof HTMLAnchorElement) ||
      !container.contains(link) ||
      link.target.toLowerCase() !== "_blank" ||
      link.hasAttribute("download")
    ) {
      return;
    }

    let destination: URL;
    try {
      destination = new URL(link.href);
    } catch {
      return;
    }
    if (destination.protocol !== "https:" && destination.protocol !== "http:") {
      return;
    }

    // Suppress NitroPack's replay, then navigate during the trusted interaction.
    click.preventDefault();
    window.open(destination.href, "_blank", "noopener,noreferrer");
  };

  // Native anchor handlers can claim checkout clicks before this fallback runs.
  // ShadowRoot listeners avoid NitroPack's delayed HTMLElement listener wrapper.
  root.addEventListener("click", recoverLink, false);
  return () => root.removeEventListener("click", recoverLink, false);
}
