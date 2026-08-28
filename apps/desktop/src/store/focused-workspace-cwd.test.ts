import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ClientSessionState } from '@/app/types'
import { group } from '@/components/pane-shell/tree/model'
import { $layoutTree, declareDefaultTree, noteActiveTreeGroup } from '@/components/pane-shell/tree/store'
import {
  $selectedStoredSessionId,
  commitWorkspaceCwdForSelectedSession,
  releaseWorkspaceCwdOwner,
  setCurrentCwdTransient,
  setSessions,
  setWorkspaceCwdOwner
} from '@/store/session'
import { $focusedWorkspaceCwd, $sessionStates, $sessionTiles } from '@/store/session-states'

const row = (id: string, cwd: null | string) =>
  ({
    archived: false,
    cwd,
    ended_at: null,
    id,
    input_tokens: 0,
    is_active: true,
    last_active: 0,
    message_count: 1,
    model: null,
    output_tokens: 0,
    started_at: 0,
    title: id
  }) as never

const slice = (storedSessionId: string, cwd: string) =>
  ({ cwd, storedSessionId }) as unknown as ClientSessionState

/** Focus a TILE the way the layout tree does: its pane is the active tab. */
function focusTile(storedSessionId: string) {
  $sessionTiles.set([{ storedSessionId }])
  declareDefaultTree(
    group(['workspace', `session-tile:${storedSessionId}`], {
      active: `session-tile:${storedSessionId}`,
      id: 'grp-main'
    })
  )
  noteActiveTreeGroup('grp-main')
}

describe('$focusedWorkspaceCwd', () => {
  beforeEach(() => {
    window.localStorage.clear()
    $sessionStates.set({})
    $sessionTiles.set([])
    $layoutTree.set(null)
    noteActiveTreeGroup(null)
    setSessions(() => [])
    $selectedStoredSessionId.set(null)
    setCurrentCwdTransient('')
    setWorkspaceCwdOwner(null)
  })

  afterEach(() => {
    $sessionStates.set({})
    $sessionTiles.set([])
    $layoutTree.set(null)
    noteActiveTreeGroup(null)
    setSessions(() => [])
    $selectedStoredSessionId.set(null)
    setCurrentCwdTransient('')
    setWorkspaceCwdOwner(null)
  })

  // THE regression, measured in the running app: a base-image tile was focused
  // while the primary chat sat in main-quarkus. The Files pane read the
  // `$currentCwd` singleton — which describes the PRIMARY chat, because a tile's
  // runtime deliberately never publishes into it (`foreground: false`) — and so
  // listed main-quarkus with header MAIN-QUARKUS, while the statusbar correctly
  // said base-image.
  it('follows a focused TILE, not the primary chat singleton', () => {
    $selectedStoredSessionId.set('sess-primary')
    setSessions(() => [row('sess-primary', '/main-quarkus'), row('sess-tile', '/base-image')])
    commitWorkspaceCwdForSelectedSession('/main-quarkus')
    focusTile('sess-tile')

    expect($focusedWorkspaceCwd.get()).toBe('/base-image')
  })

  it('prefers the tile runtime slice over its stored row', () => {
    $selectedStoredSessionId.set('sess-primary')
    setSessions(() => [row('sess-primary', '/main-quarkus'), row('sess-tile', '/base-image')])
    commitWorkspaceCwdForSelectedSession('/main-quarkus')
    focusTile('sess-tile')
    $sessionTiles.set([{ runtimeId: 'rt-tile', storedSessionId: 'sess-tile' }])
    $sessionStates.set({ 'rt-tile': slice('sess-tile', '/base-image/.worktrees/feature') })

    expect($focusedWorkspaceCwd.get()).toBe('/base-image/.worktrees/feature')
  })

  // A tile with no workspace stays empty rather than naming another project.
  it('stays empty for a detached focused tile', () => {
    $selectedStoredSessionId.set('sess-primary')
    setSessions(() => [row('sess-primary', '/main-quarkus'), row('sess-tile', null)])
    commitWorkspaceCwdForSelectedSession('/main-quarkus')
    focusTile('sess-tile')

    expect($focusedWorkspaceCwd.get()).toBe('')
  })

  it('uses the primary singleton when the primary chat is focused and owns it', () => {
    $selectedStoredSessionId.set('sess-primary')
    setSessions(() => [row('sess-primary', null)])
    commitWorkspaceCwdForSelectedSession('/main-quarkus')

    expect($focusedWorkspaceCwd.get()).toBe('/main-quarkus')
  })

  // Ownership gates the singleton rung only: during a switch it still names the
  // conversation the user just left (ae6eb578bb).
  it('ignores an un-owned singleton', () => {
    $selectedStoredSessionId.set('sess-switching')
    setSessions(() => [])
    setCurrentCwdTransient('/previous-project')
    releaseWorkspaceCwdOwner()

    expect($focusedWorkspaceCwd.get()).toBe('')
  })

  // …but it must NOT gate the ROW rung: a released marker says nothing about the
  // row, so dropping it too would blank a workspace we do know (416e025c46).
  it('still uses the stored row while ownership is released', () => {
    $selectedStoredSessionId.set('sess-known')
    setSessions(() => [row('sess-known', '/its-own-project')])
    setCurrentCwdTransient('/previous-project')
    releaseWorkspaceCwdOwner()

    expect($focusedWorkspaceCwd.get()).toBe('/its-own-project')
  })

  it('labels a fresh draft, whose null owner matches its null selection', () => {
    setCurrentCwdTransient('/draft-target')
    setWorkspaceCwdOwner(null)

    expect($focusedWorkspaceCwd.get()).toBe('/draft-target')
  })

  it('is reactive: focusing away from the tile returns the primary workspace', () => {
    $selectedStoredSessionId.set('sess-primary')
    setSessions(() => [row('sess-primary', '/main-quarkus'), row('sess-tile', '/base-image')])
    commitWorkspaceCwdForSelectedSession('/main-quarkus')
    focusTile('sess-tile')
    expect($focusedWorkspaceCwd.get()).toBe('/base-image')

    noteActiveTreeGroup(null)
    declareDefaultTree(group(['workspace'], { active: 'workspace', id: 'grp-main' }))

    expect($focusedWorkspaceCwd.get()).toBe('/main-quarkus')
  })
})
