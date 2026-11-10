/** Where customers lands after logging in. */
export const CUSTOMER_HOME = "/shop";

/** Every customer route. Kept free of UI imports, since proxy.ts reads it on every request. */
export const CUSTOMER_PATHS = ["/shop", "/cart", "/orders", "/design", "/chat", "/account"] as const;

export function isCustomerPath(path: string) {
  return CUSTOMER_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}
