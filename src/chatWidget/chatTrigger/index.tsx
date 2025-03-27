import { MessageSquare, X } from "lucide-react"
export default function ChatTrigger({ 
    style, 
    open, 
    setOpen, 
    triggerRef,
    buttonColor,
    buttonTextColor
}: { 
    style?: React.CSSProperties, 
    open: boolean, 
    setOpen: Function, 
    triggerRef: React.RefObject<HTMLButtonElement> | null,
    buttonColor?: string,
    buttonTextColor?: string
}) {
    const customStyles = {
        ...style,
        ...(buttonColor && { backgroundColor: `${buttonColor} !important` }),
        ...(buttonTextColor && { color: `${buttonTextColor} !important` })
    };

    return (
        <button ref={triggerRef} style={customStyles}
            onClick={() => { setOpen(!open) }}
            onMouseDown={(e) => {
                e.preventDefault()
            }}
            className="cl-trigger">
            <X className={"cl-trigger-icon " + (open ? "cl-scale-100" : "cl-scale-0")} />
            <MessageSquare className={"cl-trigger-icon " + (open ? "cl-scale-0" : "cl-scale-100")} />
        </button>
    )
}