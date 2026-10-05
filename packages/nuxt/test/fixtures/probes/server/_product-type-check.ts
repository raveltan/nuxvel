type IsAny<T> = 0 extends 1 & T ? true : false;

export const productNameIsTyped: IsAny<ProductName> extends true
  ? never
  : [ProductName] extends ["_course" | "_pro"]
    ? ["_course" | "_pro"] extends [ProductName]
      ? true
      : never
    : never = true;

export const productNamespaceIsTyped: IsAny<typeof $products._pro> extends true ? never : true = true;
