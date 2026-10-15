import { spawn } from 'node:child_process'
import crossSpawn from 'cross-spawn'

// Built-in commands keep the executable separate from its fixed arguments.
// A shell command is supported only as an explicit Trusted-tier override.
export function createAgentInvocation({ executable, args = [], override, permission = 'standard' }) {
  if (override != null && typeof override !== 'string') throw new Error('Command override must be a string')
  if (override?.trim()) {
    if (permission !== 'trusted') {
      throw new Error('Command override requires the Trusted permission tier (it replaces the whole command, bypassing all tier-based CLI restrictions) — switch to Trusted in Settings, or clear the override.')
    }
    return { command: override.trim(), displayCommand: override.trim() }
  }
  if (typeof executable !== 'string' || !executable || executable.includes('\0')) {
    throw new Error('Agent executable must be a non-empty path or command name')
  }
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) {
    throw new Error('Agent arguments must be strings')
  }
  return {
    executable,
    args: [...args],
    displayCommand: [JSON.stringify(executable), ...args].join(' '),
  }
}

export function spawnAgentProcess(invocation, options = {}) {
  const spawnOptions = { ...options, windowsHide: true }
  if (invocation.command) {
    // Deliberate shell syntax belongs to the owner's Trusted command override.
    // Prompts are always written to stdin by the caller, never interpolated here.
    return spawn(invocation.command, { ...spawnOptions, shell: true })
  }
  // cross-spawn escapes Windows .cmd shims when a command interpreter is needed;
  // native executables run directly. Do not join this argument array into a string.
  return crossSpawn(invocation.executable, invocation.args, { ...spawnOptions, shell: false })
}
