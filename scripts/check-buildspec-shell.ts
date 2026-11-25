import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';

export function bashSyntax(script: string, label: string): string | null {
  const file = path.join(os.tmpdir(), label);
  fs.writeFileSync(file, script);
  try {
    execFileSync('bash', ['-n', file], { stdio: 'pipe' });
    return null;
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error
      ? String((error as { stderr?: Buffer }).stderr ?? '')
      : '';
    return stderr || String(error);
  } finally {
    fs.unlinkSync(file);
  }
}

export function shellcheck(script: string, label: string): string | null {
  const file = path.join(os.tmpdir(), label);
  fs.writeFileSync(file, script);
  try {
    // The buildspec body is the inside of `bash <<'BASH'`, so it has no shebang.
    // Without -s bash, shellcheck reports SC2148 and stops.
    execFileSync('shellcheck', ['-s', 'bash', '-S', 'error', file], { stdio: 'pipe' });
    return null;
  } catch (error) {
    const stdout = error instanceof Error && 'stdout' in error
      ? String((error as { stdout?: Buffer }).stdout ?? '')
      : '';
    const stderr = error instanceof Error && 'stderr' in error
      ? String((error as { stderr?: Buffer }).stderr ?? '')
      : '';
    return `${stdout}\n${stderr}`.trim() || String(error);
  } finally {
    fs.unlinkSync(file);
  }
}

export function e2eBuildScript(stack: Stack): string {
  const projects = Template.fromStack(stack).findResources('AWS::CodeBuild::Project');
  const project = Object.values(projects)[0] as { Properties: { Source: { BuildSpec: string } } };
  const spec = JSON.parse(project.Properties.Source.BuildSpec) as {
    phases: { build: { commands: string[] } };
  };
  const command = spec.phases.build.commands[0];
  const match = command.match(/^bash <<'BASH'\n([\s\S]*)\nBASH$/);
  if (!match) {
    throw new Error('E2E build command is not one bash heredoc');
  }
  return match[1];
}

// `bash -n` on the outer `bash <<'BASH'` wrapper does not parse a quoted heredoc.
// This checks the body CodeBuild will execute.
export function assertE2eBuildScript(script: string): void {
  const syntaxError = bashSyntax(script, 'e2e-buildspec.sh');
  if (syntaxError) {
    throw new Error(`E2E build script failed bash -n:\n${syntaxError}`);
  }
  if (/find e2e -type f \(/.test(script)) {
    throw new Error('E2E build script still groups find predicates with a bare parenthesis');
  }
  const shellcheckError = shellcheck(script, 'e2e-buildspec.sh');
  if (shellcheckError) {
    throw new Error(`E2E build script failed shellcheck:\n${shellcheckError}`);
  }
}

export function assertProvisionScript(): void {
  const provisionPath = path.resolve(__dirname, 'provision-e2e-user.sh');
  const provision = fs.readFileSync(provisionPath, 'utf8');
  const provisionSyntax = bashSyntax(provision, 'provision-e2e-user.sh');
  if (provisionSyntax) {
    throw new Error(`provision-e2e-user.sh failed bash -n:\n${provisionSyntax}`);
  }
  const provisionShellcheck = shellcheck(provision, 'provision-e2e-user.sh');
  if (provisionShellcheck) {
    throw new Error(`provision-e2e-user.sh failed shellcheck:\n${provisionShellcheck}`);
  }
}
