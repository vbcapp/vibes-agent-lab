import type { Register } from 'claude-code'

// 約定：面板 mod 註冊一個打開面板的指令，說明以【面板】開頭；
// 直接做事的按鈕指令說明以【按鈕】開頭。暗號後面是按鈕上的字
const MARKS = [
  { mark: '【面板】', icon: '📂' },
  { mark: '【按鈕】', icon: '🚀' },
] as const

function markOf(description: string) {
  return MARKS.find(one => description.startsWith(one.mark))
}

export const register: Register = on => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) {
      return below
    }

    const panels = (await $.command.list()).filter(
      one => markOf(one.description) !== undefined,
    )
    if (panels.length === 0) {
      return below
    }

    const { Box, Button } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Box flexWrap="wrap" columnGap={2}>
          {panels.map(panel => {
            const kind = markOf(panel.description)
            const words = panel.description.slice(kind?.mark.length ?? 0).trim()
            return (
              <Button
                key={`panel:${panel.name}`}
                plain
                label={`${kind?.icon ?? '📂'} ${words || panel.name}`}
                onPress={() => $.command.run({ command: panel.name })}
              />
            )
          })}
        </Box>
        {below}
      </Box>
    )
  })
}
