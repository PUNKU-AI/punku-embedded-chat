import { MessageSquare, X, Sparkles } from "lucide-react"
export default function ChatTrigger({
    style,
    open,
    setOpen,
    buttonColor,
    buttonTextColor,
    theme = "default",
    triggerIcon
}: {
    style?: React.CSSProperties,
    open: boolean,
    setOpen: Function,
    buttonColor?: string,
    buttonTextColor?: string,
    theme?: "default" | "dark" | "ocean" | "aurora" | "punku-ai-bookingkit" | "swarovski",
    triggerIcon?: string
}) {
    const customStyles = {
        ...style,
        ...(buttonColor && { backgroundColor: buttonColor }),
        ...(buttonTextColor && { color: buttonTextColor })
    };

    // For Swarovski theme, show diamond icon instead of chat bubble
    const isSwarovski = theme === "swarovski";

    return (
        <button style={customStyles}
            onClick={() => { setOpen(!open) }}
            onMouseDown={(e) => {
                e.preventDefault()
            }}
            className={`cl-trigger ${theme ? `theme-${theme}` : ""}`}>
            <X className={"cl-trigger-icon " + (open ? "cl-scale-100" : "cl-scale-0")} />
            {triggerIcon ? (
                <img
                    src={triggerIcon}
                    alt="Chat icon"
                    className={"cl-trigger-icon cl-trigger-img " + (open ? "cl-scale-0" : "cl-scale-100")}
                />
            ) : isSwarovski ? (
                <Sparkles className={"cl-trigger-icon " + (open ? "cl-scale-0" : "cl-scale-100")} />
            ) : (
                <MessageSquare className={"cl-trigger-icon " + (open ? "cl-scale-0" : "cl-scale-100")} />
            )}
        </button>
    )
}