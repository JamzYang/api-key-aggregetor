// Mock implementation of vscode module for testing

export const workspace = {
  getConfiguration: () => ({
    get: () => [],
  }),
};

export const window = {
  showInformationMessage: () => {},
  showWarningMessage: () => {},
  showErrorMessage: () => {},
  showInputBox: () => {},
  showQuickPick: () => {},
};

export const commands = {
  registerCommand: () => {},
};

export const ExtensionContext = function() {};

export const Uri = {
  file: () => {},
  parse: () => {},
};

export const Range = function() {};
export const Position = function() {};
export const Selection = function() {};

// Add other vscode APIs as needed for your tests
export default {
  workspace,
  window,
  commands,
  ExtensionContext,
  Uri,
  Range,
  Position,
  Selection,
};
