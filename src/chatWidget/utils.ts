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
		const top = parent.getBoundingClientRect().top + parent.clientTop;
		const target = element.getBoundingClientRect();
		const above = top - target.top;
		const below = target.bottom - (top + parent.clientHeight);
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

// Above this scale the visitor has pinch-zoomed in.
const PINCH_ZOOM_SCALE = 1.01;

/*
 * Copy the visual viewport box to CSS variables on `element`, now and after
 * each visual viewport resize or scroll. When the visitor pinch-zooms in,
 * remove the variables: the element then stays on the layout viewport, and
 * the visitor can pan over it. Returns a function that stops the updates.
 */
export function trackVisualViewport(element: HTMLElement) {
	const viewport = window.visualViewport;
	if (!viewport) return () => {};

	let frame: number | undefined;
	const update = () => {
		frame = undefined;
		const zoomedIn = viewport.scale > PINCH_ZOOM_SCALE;
		for (const [key, property] of Object.entries(VISUAL_VIEWPORT_PROPERTIES)) {
			const value = zoomedIn ? '' : `${viewport[key as keyof typeof VISUAL_VIEWPORT_PROPERTIES]}px`;
			// The widget root tracks on every page. Write only a changed box.
			if (element.style.getPropertyValue(property) === value) continue;
			if (value) element.style.setProperty(property, value);
			else element.style.removeProperty(property);
		}
	};
	const scheduleUpdate = () => {
		if (frame === undefined) frame = window.requestAnimationFrame(update);
	};

	update();
	viewport.addEventListener('resize', scheduleUpdate);
	viewport.addEventListener('scroll', scheduleUpdate);
	return () => {
		viewport.removeEventListener('resize', scheduleUpdate);
		viewport.removeEventListener('scroll', scheduleUpdate);
		if (frame !== undefined) window.cancelAnimationFrame(frame);
	};
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
