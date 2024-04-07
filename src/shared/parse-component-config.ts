export interface SFCParserOptions {
  pad?: true | "line" | "space";
  deindent?: boolean
}

export const parseComponentConfig: SFCParserOptions = {
  // pad: "line",
  deindent: false,
}
