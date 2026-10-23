export function getChatPosition(
	triggerPosition: DOMRect,
	Cwidth:number,
	Cheight:number,
	position?: string,
): { 
	top: string; 
	left: string;
	bottom?: string;
	right?: string;
	position?: string 
} {
	if (!triggerPosition) {
		return { top: "0px", left: "0px" }; // Return empty string if trigger position is not available
	}

	// Default to fixed bottom-right of the screen
	if(!position) {
		return { 
			top: "auto", 
			left: "auto", 
			position: "bottom-right",
			bottom: "20px",
			right: "20px" 
		};
	}

	const { top, left, width, height } = triggerPosition;
	const distance = 5; // Adjust this value to set the desired distance from the trigger

	switch (position) {
		case "top-left":
			return { top: - distance - Cheight + "px", left: -Cwidth + "px" };
		case "top-center":
			return { top: - distance - Cheight + "px", left: width/2-Cwidth / 2 + "px" };
		case "top-right":
			return { top: - distance - Cheight + "px", left: width+ "px" };
		case "center-left":
			return { top: width/2-Cheight/2 + "px", left: -Cwidth - distance + "px" };
		case "center-right":
			return {
				top: width/2-Cheight/2 + "px",
				left: width + distance + "px",
			};
		case "bottom-right":
			return { top: -Cheight - distance + "px", left: -Cwidth - distance + "px" };
		case "bottom-center":
			return {
				top: distance + height+ "px",
				left: width/2-Cwidth / 2 + "px",
			};
		case "bottom-left":
			return { top: distance + height+ "px", left: -Cwidth + "px"};
		default:
			return { top: distance + height+ "px", left: width + "px" };	
		}
}

export function getAnimationOrigin(position?:string) {
	if(!position) return "origin-bottom-right";
	switch (position) {
		case "top-left":
			return 'origin-bottom-right'
		case "top-center":
			return "origin-bottom";
		case "top-right":
			return "origin-bottom-left";
		case "center-left":
			return "origin-center";
		case "center-right":
			return "origin-center";
		case "bottom-right":
			return "origin-top-left";
		case "bottom-center":
			return "origin-top";
		case "bottom-left":
			return "origin-top-right"
		default:
			return "origin-top-left"
		}
}

export function extractMessageFromOutput(output:{type:string, message:any}){
	// console.log(output)
	const {type, message} = output;
	if(type === "text") return message;
	if (type ==="message") return message.text;
	if(type==="object") return message.text;
	return "Unknown message structure"
}

export function detectBrowserLanguage(availableLanguages: string[] = ['en', 'de']): string {
	// Get browser languages in order of preference
	const browserLanguages = navigator.languages || [navigator.language];

	for (const browserLang of browserLanguages) {
		// Extract the main language code (e.g., 'en' from 'en-US')
		const mainLangCode = browserLang.split('-')[0].toLowerCase();
		// console.log('Browser language:', mainLangCode);

		// Check if this language is available
		if (availableLanguages.includes(mainLangCode)) {
			return mainLangCode;
		}
	}

	// Default to English if no supported language is found
	return 'en';
}
/*
 * Rendered px per layout px of an element, from its client rect size and its
 * offset size. Below 1 inside a scaled page frame (scaledPage.ts). 1 without
 * layout (jsdom).
 */
export function renderedScale(renderedSize: number, layoutSize: number) {
	return renderedSize > 0 && layoutSize > 0 ? renderedSize / layoutSize : 1;
}

/*
 * The border-box height of an element in layout px, with its fraction.
 * offsetHeight rounds: a list 76.2 px tall read as 76 px gave a scale of
 * 1.003, and 1474 px of scrolling then stopped 4.5 px short of a link (#90).
 */
function layoutHeight(element: HTMLElement) {
	const style = getComputedStyle(element);
	const height = parseFloat(style.height);
	if (!Number.isFinite(height)) return element.offsetHeight;
	if (style.boxSizing === "border-box") return height;
	return height + parseFloat(style.paddingTop || "0") + parseFloat(style.paddingBottom || "0") +
		parseFloat(style.borderTopWidth || "0") + parseFloat(style.borderBottomWidth || "0");
}

/*
 * Scroll the nearest scrolling ancestor, such as the message list, so that
 * `element` is visible. focus() and scrollIntoView() also scroll the host page
 * and the visual viewport. On a phone page wider than the screen, that pans the
 * visitor's view (#69). This scrolls one widget container and nothing else.
 */
export function revealInScrollContainer(element: HTMLElement) {
	const { body, documentElement } = element.ownerDocument;
	for (
		let parent = element.parentElement;
		parent && parent !== body && parent !== documentElement;
		parent = parent.parentElement
	) {
		if (!/auto|scroll|overlay/.test(getComputedStyle(parent).overflowY)) continue;
		if (parent.scrollHeight <= parent.clientHeight) continue;
		// Client rects are page px. A scaled page frame (scaledPage.ts) makes them
		// smaller than the container px of scrollTop.
		const parentBox = parent.getBoundingClientRect();
		const scale = renderedScale(parentBox.height, layoutHeight(parent));
		const top = parentBox.top / scale + parent.clientTop;
		const target = element.getBoundingClientRect();
		const above = top - target.top / scale;
		const below = target.bottom / scale - (top + parent.clientHeight);
		// Show the whole element, or its top when it is taller than the container.
		if (above > 0) parent.scrollTop -= above;
		else if (below > 0) parent.scrollTop += Math.min(below, -above);
		return;
	}
}

/*
 * CSS variables for the visible part of the page (the visual viewport).
 * A position: fixed box follows the layout viewport. On a phone, a host page
 * element wider than the screen makes the layout viewport larger than the
 * screen, and the on-screen keyboard makes the visible part smaller (#77).
 */
export const VISUAL_VIEWPORT_PROPERTIES = {
	offsetLeft: '--cl-visual-viewport-left',
	offsetTop: '--cl-visual-viewport-top',
	width: '--cl-visual-viewport-width',
	height: '--cl-visual-viewport-height',
} as const;

// Above this zoom the visitor has pinch-zoomed in.
const PINCH_ZOOM_SCALE = 1.01;

/** The visual viewport box, in px from the layout viewport origin. */
export type VisualViewportBox = Pick<VisualViewport, keyof typeof VISUAL_VIEWPORT_PROPERTIES>;
type VisualViewportListener = (box: VisualViewportBox | null) => void;

const visualViewportListeners = new Set<VisualViewportListener>();
let observedViewport: VisualViewport | null = null;

/*
 * The layout viewport size without scrollbars: the client size of the
 * scrolling element (the root, or the body in quirks mode).
 */
export function getLayoutViewportSize() {
	const element = document.scrollingElement ?? document.documentElement;
	return { width: element?.clientWidth ?? 0, height: element?.clientHeight ?? 0 };
}

/*
 * Screen px per CSS px of the page without pinch zoom. A page with a small
 * fixed layout width, such as <meta name="viewport" content="width=320"> on
 * Wix sites, is scaled up to the screen width: 2.3 on a 740 px wide phone.
 * The visible width in screen px (width x scale) stays the same when the
 * visitor pinch-zooms, so this is the scale at which the page fits the
 * screen width. It is 1 on pages with width=device-width and on desktops.
 */
export function getPageScale(viewport: VisualViewport | null | undefined = window.visualViewport) {
	const layoutWidth = getLayoutViewportSize().width;
	if (!viewport || !layoutWidth || !(viewport.scale > 0)) return 1;
	return (viewport.width * viewport.scale) / layoutWidth;
}

function readVisualViewport(): VisualViewportBox | null {
	const viewport = observedViewport;
	if (!viewport || viewport.scale > getPageScale(viewport) * PINCH_ZOOM_SCALE) return null;
	const { offsetLeft, offsetTop, width, height } = viewport;
	return { offsetLeft, offsetTop, width, height };
}

function notifyVisualViewportListeners() {
	const box = readVisualViewport();
	visualViewportListeners.forEach((listener) => listener(box));
}

/*
 * Call `listener` with the visual viewport box now, and after each visual
 * viewport resize or scroll and each window resize. A wider host page makes
 * the layout viewport larger, which fires a window resize. All listeners
 * share one set of event listeners. The browser fires these events in the
 * rendering steps of a frame, so the listeners update before that frame is
 * painted. The box is null while the visitor has pinch-zoomed in, and
 * without visualViewport. Returns a function that stops the updates.
 */
export function subscribeVisualViewport(listener: VisualViewportListener) {
	if (visualViewportListeners.size === 0) {
		observedViewport = window.visualViewport ?? null;
		observedViewport?.addEventListener('resize', notifyVisualViewportListeners);
		observedViewport?.addEventListener('scroll', notifyVisualViewportListeners);
		window.addEventListener('resize', notifyVisualViewportListeners);
	}
	visualViewportListeners.add(listener);
	listener(readVisualViewport());
	return () => {
		if (!visualViewportListeners.delete(listener) || visualViewportListeners.size > 0) return;
		observedViewport?.removeEventListener('resize', notifyVisualViewportListeners);
		observedViewport?.removeEventListener('scroll', notifyVisualViewportListeners);
		window.removeEventListener('resize', notifyVisualViewportListeners);
		observedViewport = null;
	};
}

/*
 * Copy the visual viewport box to CSS variables on `element`, now and after
 * each change. When the visitor pinch-zooms in, remove the variables: the
 * element then stays on the layout viewport, and the visitor can pan over it.
 * Returns a function that stops the updates. The last box stays.
 */
export function trackVisualViewport(element: HTMLElement) {
	return subscribeVisualViewport((box) => {
		for (const [key, property] of Object.entries(VISUAL_VIEWPORT_PROPERTIES)) {
			const value = box ? `${box[key as keyof VisualViewportBox]}px` : '';
			// A changed variable restyles the whole element subtree. Write only changes.
			if (element.style.getPropertyValue(property) === value) continue;
			if (value) element.style.setProperty(property, value);
			else element.style.removeProperty(property);
		}
	});
}

export type ViewportEdge = 'top' | 'right' | 'bottom' | 'left';

/*
 * A CSS inset that places a position: fixed box `offset` from one edge of the
 * visible part of the page. It reads the trackVisualViewport variables from
 * the box or an ancestor. In `right` and `bottom`, 100% is the layout
 * viewport, so the inset adds the strip of the layout viewport that is
 * outside the screen. Without the variables, the inset is `offset`, as for a
 * plain fixed box.
 */
export function visualViewportInset(edge: ViewportEdge, offset: string) {
	const { offsetLeft: left, offsetTop: top, width, height } = VISUAL_VIEWPORT_PROPERTIES;
	switch (edge) {
		case 'top':
			return `calc(var(${top}, 0px) + ${offset})`;
		case 'left':
			return `calc(var(${left}, 0px) + ${offset})`;
		case 'bottom':
			return `calc(100% - var(${top}, 0px) - var(${height}, 100%) + ${offset})`;
		case 'right':
			return `calc(100% - var(${left}, 0px) - var(${width}, 100%) + ${offset})`;
	}
}
