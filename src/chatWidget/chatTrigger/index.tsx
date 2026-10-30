import { MessageSquare, X, Sparkles } from "lucide-react"
export default function ChatTrigger({
    style,
    open,
    setOpen,
    triggerRef,
    buttonColor,
    buttonTextColor,
    theme = "default",
    triggerIcon,
    openLabel = "Open chat",
    closeLabel = "Close chat",
    lang,
}: {
    style?: React.CSSProperties,
    open: boolean,
    setOpen: Function,
    triggerRef: React.RefObject<HTMLButtonElement> | null,
    buttonColor?: string,
    buttonTextColor?: string,
    theme?: "default" | "dark" | "ocean" | "aurora" | "punku-ai-bookingkit" | "swarovski",
    triggerIcon?: string,
    /** The button's name for screen readers while the chat is closed. */
    openLabel?: string,
    /** The button's name for screen readers while the chat is open. */
    closeLabel?: string,
    /** The language of the two names, the chat language (WCAG 3.1.2). */
    lang?: string,
}) {
    const customStyles = {
        ...style,
        ...(buttonColor && { backgroundColor: buttonColor }),
        ...(buttonTextColor && { color: buttonTextColor })
    };

    // For Swarovski theme, show diamond icon instead of chat bubble
    const isSwarovski = theme === "swarovski";

    // The icons are decoration: the label says what the button does.
    return (
        <button ref={triggerRef} style={customStyles}
            type="button"
            aria-label={open ? closeLabel : openLabel}
            aria-expanded={open}
            lang={lang}
            onClick={() => { setOpen(!open) }}
            onMouseDown={(e) => {
                e.preventDefault()
            }}
            className={`cl-trigger ${theme ? `theme-${theme}` : ""}`}>
            <X aria-hidden="true" className={"cl-trigger-icon " + (open ? "cl-scale-100" : "cl-scale-0")} />
            {triggerIcon ? (
                <img
                    src={triggerIcon}
                    alt=""
                    className={"cl-trigger-icon cl-trigger-img " + (open ? "cl-scale-0" : "cl-scale-100")}
                />
            ) : isSwarovski ? (
                <Sparkles aria-hidden="true" className={"cl-trigger-icon " + (open ? "cl-scale-0" : "cl-scale-100")} />
            ) : (
                <MessageSquare aria-hidden="true" className={"cl-trigger-icon " + (open ? "cl-scale-0" : "cl-scale-100")} />
            )}
        </button>
    )
}
