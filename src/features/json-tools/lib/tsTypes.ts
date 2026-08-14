/**
 * 由 JSON 值生成 TypeScript 接口。
 * 数组取首个元素推断元素类型（空数组输出 unknown[]）；
 * 对象命名规则：根为 rootName，嵌套按父名+字段名（数组元素追加 Item）。
 */
export function jsonToTsTypes(value: unknown, rootName = 'Root'): string {
  try {
    const interfaces = new Map<string, string>();
    const order: string[] = [];
    const nameByObject = new Map<object, string>();
    const usedNames = new Set<string>();

    const nextName = (base: string): string => {
      let name = base;
      let index = 2;
      while (usedNames.has(name)) {
        name = `${base}${index}`;
        index += 1;
      }
      usedNames.add(name);
      return name;
    };

    const typeOf = (current: unknown, nameHint: string): string => {
      if (current === null) return 'null';
      if (Array.isArray(current)) {
        if (current.length === 0) return 'unknown[]';
        return `${typeOf(current[0], `${nameHint}Item`)}[]`;
      }
      switch (typeof current) {
        case 'string':
          return 'string';
        case 'number':
          return 'number';
        case 'boolean':
          return 'boolean';
        case 'object': {
          const record = current as Record<string, unknown>;
          const existing = nameByObject.get(record);
          if (existing) return existing;
          const name = nextName(nameHint);
          nameByObject.set(record, name);
          order.push(name);
          const fields = Object.entries(record)
            .map(([key, fieldValue]) => {
              const safeKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
                ? key
                : JSON.stringify(key);
              const fieldName = `${name}${capitalize(key)}`;
              return `  ${safeKey}: ${typeOf(fieldValue, fieldName)};`;
            })
            .join('\n');
          interfaces.set(name, `export interface ${name} {\n${fields}\n}`);
          return name;
        }
        default:
          return 'unknown';
      }
    };

    typeOf(value, rootName);
    return order.map((name) => interfaces.get(name)).join('\n\n');
  } catch (err) {
    // 深层嵌套超出调用栈：输出兜底类型而不是让页面崩溃
    if (err instanceof RangeError) return 'export type Root = unknown;';
    throw err;
  }
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}
