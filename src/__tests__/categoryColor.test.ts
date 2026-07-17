import {
  categoryColorToPickerHex,
  getCategoryColorPresentation,
} from "../utils/categoryColor";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assert(
  categoryColorToPickerHex("bg-emerald-300/70") === "#6ee7b7",
  "Legacy category colors should initialize the picker with an equivalent hex color.",
);
assert(
  categoryColorToPickerHex("#ABCDEF") === "#abcdef",
  "Hex colors should be normalized for the picker.",
);
assert(
  categoryColorToPickerHex(null) === "#ffffff",
  "Categories without a color should show white in the picker.",
);

const hexPresentation = getCategoryColorPresentation("#123456");
assert(hexPresentation.className === "", "Hex colors should not become Tailwind classes.");
assert(
  hexPresentation.style?.backgroundColor === "#123456",
  "Hex colors should render through an inline background color.",
);
assert(
  getCategoryColorPresentation("bg-pink-300/70").className === "bg-pink-300/70",
  "Legacy Tailwind category colors should remain renderable.",
);
assert(
  getCategoryColorPresentation("not-a-color", "bg-slate-100").className === "bg-slate-100",
  "Unsupported values should use the supplied fallback.",
);

console.log("Category color tests passed.");
