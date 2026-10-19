import { expect, test } from "bun:test";
import zh from "../src/i18n/locales/zh-CN";
import en from "../src/i18n/locales/en-US";
for (const [locale, copy, brand, disabled] of [["zh", zh, "无限画布", "自定义模型脚本在本站禁用"], ["en", en, "Infinite Canvas", "Custom model scripts are disabled on this site"]] as const) {
 test(`${locale}: script descriptions match disabled capability and preserve brand`, () => {
  expect(copy.meta.title).toBe(brand);
  expect(copy.canvas.title).toBe(brand);
  expect(copy.config.channels.description).toContain(disabled);
  expect(copy.config.channelEditor.modelDescription).toContain(disabled);
  expect(copy.config.channelEditor.modelDescription).toContain("{{count}}");
  expect(copy.modelPlugin.authoring.intro).toContain(disabled);
  expect(copy.modelPlugin.authoring.intro).toContain("{{capability}}");
  expect(copy.modelPlugin.authoring.intro).toContain("{{model}}");
 });
}
