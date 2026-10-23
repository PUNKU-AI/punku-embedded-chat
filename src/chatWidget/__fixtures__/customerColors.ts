// The colour settings of the saved customer embeds, without names, URLs or
// IDs: only the theme and the colours that the controls use. Captured on
// 2026-10-23 from demos/live-sites (24 embeds).
import type { ControlColorProps } from "../controlColors";

export type CustomerColors = ControlColorProps & {
  name: string;
  closed_widget_hint_background_color?: string;
  closed_widget_hint_text_color?: string;
};

export const CUSTOMER_COLORS: CustomerColors[] = [
  {"name": "customer 01", "theme": "default", "bot_message_color": "#7a2022", "bot_message_text_color": "#ffffff", "link_color": "#ffffff", "closed_widget_hint_background_color": "#ffffff", "bot_message_style": {"backgroundColor": "#7a2022", "color": "#ffffff"}, "send_button_style": {"backgroundColor": "#7a2022"}},
  {"name": "customer 02", "theme": "default", "background_color": "#33a1e6", "closed_widget_hint_text_color": "#2a3849", "send_button_style": {"backgroundColor": "#2a3849"}},
  {"name": "customer 03"},
  {"name": "customer 04", "theme": "default", "closed_widget_hint_text_color": "#003a5d", "send_button_style": {"background": "linear-gradient(135deg, #00496F 0%, #246479 100%)"}},
  {"name": "customer 05", "theme": "default", "send_button_style": {"backgroundColor": "#0c7cb1"}},
  {"name": "customer 06", "theme": "default", "button_color": "#9e183b", "button_text_color": "#ffffff", "background_color": "#ffffff", "bot_message_color": "#9e183b", "bot_message_text_color": "#ffffff", "link_color": "#FFD700", "bot_message_style": {"backgroundColor": "#9e183b", "color": "#ffffff"}, "input_style": {"backgroundColor": "#ffffff"}, "input_container_style": {"backgroundColor": "#ffffff"}, "send_button_style": {"backgroundColor": "#9e183b"}},
  {"name": "customer 07", "theme": "default", "button_color": "#9e183b", "button_text_color": "#ffffff", "background_color": "#ffffff", "bot_message_color": "#9e183b", "bot_message_text_color": "#ffffff", "link_color": "#FFD700", "bot_message_style": {"backgroundColor": "#9e183b", "color": "#ffffff"}, "input_style": {"backgroundColor": "#ffffff"}, "input_container_style": {"backgroundColor": "#ffffff"}, "send_button_style": {"backgroundColor": "#9e183b"}},
  {"name": "customer 08", "theme": "default", "send_button_style": {"backgroundColor": "#d4a853"}},
  {"name": "customer 09", "theme": "default", "button_text_color": "#1C1C1C", "background_color": "#FAFAF8", "bot_message_color": "#FFFFFF", "bot_message_text_color": "#2A2A2A", "link_color": "#C69300", "closed_widget_hint_background_color": "#FFF7D6", "closed_widget_hint_text_color": "#4A4A4A", "bot_message_style": {"backgroundColor": "#FFFFFF", "color": "#2A2A2A"}, "send_button_style": {"backgroundColor": "#F2B705"}},
  {"name": "customer 10", "theme": "default", "button_text_color": "#ffffff", "background_color": "#f1efee", "bot_message_color": "#3aaa35", "bot_message_text_color": "#ffffff", "bot_message_style": {"backgroundColor": "#3aaa35", "color": "#ffffff"}, "send_button_style": {"backgroundColor": "#3aaa35"}},
  {"name": "customer 11", "theme": "dark", "button_color": "#ff8000", "button_text_color": "#000000", "closed_widget_hint_background_color": "#111111", "closed_widget_hint_text_color": "#ffffff", "send_button_style": {"backgroundColor": "#ff8000"}, "send_icon_style": {"color": "#111111"}},
  {"name": "customer 12", "theme": "default", "bot_message_color": "#791f0d", "bot_message_text_color": "#ffffff", "bot_message_style": {"backgroundColor": "#791f0d", "color": "#ffffff"}, "send_button_style": {"backgroundColor": "#791f0d"}},
  {"name": "customer 13", "theme": "default", "link_color": "#dd4a97", "send_button_style": {"backgroundColor": "#dd4a97"}},
  {"name": "customer 14", "theme": "dark", "button_color": "#3F9B47", "button_text_color": "#FFFFFF", "background_color": "#111827", "bot_message_color": "#1F2937", "bot_message_text_color": "#F9FAFB", "link_color": "#3F9B47", "closed_widget_hint_background_color": "#3F9B47", "closed_widget_hint_text_color": "#FFFFFF", "bot_message_style": {"backgroundColor": "#1F2937", "color": "#F9FAFB"}, "send_button_style": {"backgroundColor": "#3F9B47"}},
  {"name": "customer 15", "theme": "default", "link_color": "#075985", "send_button_style": {"backgroundColor": "#075985"}},
  {"name": "customer 16", "theme": "default", "button_color": "#2E3440", "bot_message_color": "#781C3C", "bot_message_text_color": "#D8DEE9"},
  {"name": "customer 17", "theme": "default", "send_button_style": {"backgroundColor": "#23beef"}},
  {"name": "customer 18", "theme": "default", "button_text_color": "#FFFFFF", "background_color": "#FFFFFF", "bot_message_color": "#EAF1FF", "bot_message_text_color": "#111827", "link_color": "#2760CF", "bot_message_style": {"backgroundColor": "#EAF1FF", "color": "#111827"}},
  {"name": "customer 19", "theme": "default", "button_text_color": "#FFFFFF", "background_color": "#FFFFFF", "bot_message_color": "#EAF1FF", "bot_message_text_color": "#111827", "link_color": "#2760CF", "bot_message_style": {"backgroundColor": "#EAF1FF", "color": "#111827"}},
  {"name": "customer 20", "theme": "default", "button_text_color": "#FFFFFF", "background_color": "#FFFFFF", "bot_message_color": "#EAF1FF", "bot_message_text_color": "#111827", "link_color": "#2760CF", "bot_message_style": {"backgroundColor": "#EAF1FF", "color": "#111827"}},
  {"name": "customer 21", "theme": "default", "button_text_color": "#FFFFFF", "background_color": "#FFFFFF", "bot_message_color": "#EAF1FF", "bot_message_text_color": "#111827", "link_color": "#2760CF", "bot_message_style": {"backgroundColor": "#EAF1FF", "color": "#111827"}},
  {"name": "customer 22", "theme": "swarovski", "bot_message_color": "rgba(255, 228, 149, 0.4)", "send_button_style": {"backgroundColor": "#FFFFFF"}, "send_icon_style": {"stroke": "#000000"}},
  {"name": "customer 23", "theme": "default", "link_color": "#76E2F5", "bot_message_style": {"backgroundColor": "#A32525", "color": "#FFFFFF"}, "send_button_style": {"backgroundColor": "#DDDDDD"}, "send_icon_style": {"stroke": "#333333"}},
  {"name": "customer 24", "theme": "punku-ai-bookingkit", "button_color": "#38AA3F", "bot_message_style": {"backgroundColor": "#F0F7FA", "color": "#0f172a"}, "send_button_style": {"background": "linear-gradient(135deg, #00496F 0%, #246479 100%)"}, "send_icon_style": {"stroke": "#FFFFFF"}},
];
