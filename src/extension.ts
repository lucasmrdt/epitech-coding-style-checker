import * as vscode from "vscode";
import * as path from "path";
import { exec } from "child_process";

type ErrorType = {
  line: number;
  error: string;
};

type FilesErrorType = {
  [path: string]: Array<ErrorType>;
};

const CONFIGURATION_ID = "epitech-coding-style";
const LINTER_PATH = path.join(__dirname, "../linter.rb");
const DIAGNOSTIC = vscode.languages.createDiagnosticCollection(
  CONFIGURATION_ID
);

const REGEX_BY_CONFIGURATION: { [key: string]: RegExp } = {
  allow_forbidden_function: RegExp("function is allowed")
};

function isIgnoredError(error: string) {
  const CONFIGURATION:
    | { [key: string]: Boolean }
    | undefined = vscode.workspace.getConfiguration().get(CONFIGURATION_ID);
  if (CONFIGURATION === undefined) {
    return false;
  }

  let errorIsIgnored = false;
  Object.keys(REGEX_BY_CONFIGURATION).forEach(key => {
    const regexp = REGEX_BY_CONFIGURATION[key];
    const isAllowedInConfiguration = CONFIGURATION[key] || false;
    if (error.match(regexp) && isAllowedInConfiguration) {
      errorIsIgnored = true;
    }
  });
  return errorIsIgnored;
}

async function codingStyleChecker() {
  try {
    const linterResult = await runLinter();
    const errors = parseResult(linterResult);
    displayLineErrors(errors);
  } catch (e) {
    // void
  }
}

function runLinter() {
  return new Promise((res: (p: string) => any, rej) =>
    exec(
      LINTER_PATH,
      { cwd: vscode.workspace.rootPath },
      (err, stdout: string, stderr: string) => (err ? rej(stderr) : res(stdout))
    )
  );
}

function parseResult(result: string): FilesErrorType {
  // remove color ANSI.
  const plainResult = result.replace(/\x1b\[[0-9;]*m/g, "");

  const linterResults = plainResult.split("\n").map((res: string) => {
    const matches = res.match(/\[(.+?):?(\d+)?\] (.+)/);

    // linter output is invalid.
    if (!matches) {
      return null;
    }

    const [, path, line, error] = matches;
    return { path, line: parseInt(line), error };
  });

  // remove invalid linter output.
  const filteredResults = linterResults.filter(el => el);

  // This is ugly sorry :( ....
  return filteredResults.reduce(
    (acc: any, curr: any) => ({
      ...acc,
      [curr.path]: acc[curr.path]
        ? [...acc[curr.path], { line: curr.line, error: curr.error }]
        : [{ line: curr.line, error: curr.error }]
    }),
    {}
  );
}

async function displayLineErrors(errors: FilesErrorType) {
  const rootPath = vscode.workspace.rootPath || "";
  const filesPath = Object.keys(errors);
  DIAGNOSTIC.clear();

  for (const filePath of filesPath) {
    const diagnostics: vscode.Diagnostic[] = [];
    const currPath = path.join(rootPath, filePath);
    const fileErrors = errors[filePath];

    let doc;
    try {
      doc = await vscode.workspace.openTextDocument(currPath);
    } catch (e) {
      continue;
    }

    for (const { line, error } of fileErrors) {
      let l, r;

      if (isIgnoredError(error)) {
        continue;
      }

      if (!line) {
        // global error
        l = doc.lineAt(doc.lineCount - 1);
        r = new vscode.Range(0, 0, doc.lineCount - 1, l.text.length);
      } else {
        // specific error
        l = doc.lineAt(line - 1);
        r = new vscode.Range(line - 1, 0, line - 1, l.text.length);
      }

      const d = new vscode.Diagnostic(
        r,
        error,
        vscode.DiagnosticSeverity.Error
      );
      d.source = "epitech-coding-style";
      diagnostics.push(d);
    }

    DIAGNOSTIC.set(doc.uri, diagnostics);
  }
}

export async function activate(context: vscode.ExtensionContext) {
  console.log("epitech-coding-style-checker is now active!");

  if (vscode.workspace) {
    vscode.workspace.onDidChangeConfiguration(codingStyleChecker);
    vscode.workspace.onDidSaveTextDocument(codingStyleChecker);
    codingStyleChecker();
  }
}

// this method is called when your extension is deactivated
export function deactivate() {}
