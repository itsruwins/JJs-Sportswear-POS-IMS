/** What the order screens watch for live updates (added to the realtime publication by the production migration). */
export const ORDER_TABLES = [
  "custom_orders",
  "custom_order_steps",
  "custom_order_photos",
  "order_status_history",
  "payments",
  "custom_order_refunds",
  "custom_order_overrides",
] as const;
