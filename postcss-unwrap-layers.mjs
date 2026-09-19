// 展平 @layer:cascade layers 需 Safari 15.4+,iOS 14.6 遇到不认识的 at-rule 会跳过整个块,
// 导致 @layer utilities 里的全部样式在真机上失效。
// 本项目各层无同优先级选择器竞争(theme=变量 / base=preflight / utilities=唯一类名),
// 剥壳后层叠行为等价。放在 @tailwindcss/postcss 之后运行。
/** @param {{ keep?: string[] }} [opts] 需要保留的层名(默认全部展平) */
export default function unwrapLayers(opts = {}) {
  const keep = new Set(opts.keep ?? []);
  return {
    postcssPlugin: "postcss-unwrap-layers",
    AtRule(atRule) {
      if (atRule.name === "layer" && !keep.has(atRule.params.trim())) {
        atRule.replaceWith(atRule.nodes ? atRule.nodes : []);
      }
    },
  };
}
unwrapLayers.postcss = true;
