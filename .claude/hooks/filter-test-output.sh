#!/usr/bin/env bash
# Hook PreToolUse (Bash): filtra a saída de comandos de teste antes que ela entre
# no contexto do Claude. Baseado no exemplo oficial (code.claude.com/docs/en/costs),
# com três melhorias:
#   1. preserva o código de saída do teste (o exemplo oficial o perdia no pipe);
#   2. mantém as últimas linhas da saída (onde fica o placar "X passed, Y failed");
#   3. salva a saída completa num arquivo, caso o Claude precise consultá-la.
#
# Só reescreve comandos de teste "simples" (sem ; & | < > ` $( ), porque devolve
# permissionDecision "allow": assim a auto-aprovação vale apenas para uma execução
# pura do runner de testes, nunca para um comando encadeado.
#
# Requer jq. Sem jq, o hook não faz nada (o comando segue normalmente).

command -v jq >/dev/null 2>&1 || { echo '{}'; exit 0; }

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

# Ajuste esta lista aos runners que vocês usam.
TEST_RE='^(npm (--prefix [^ ]+ )?(run )?test|node --test|npx (jest|vitest)|yarn test|pnpm (run )?test|pytest|python3? -m pytest|go test|cargo test|mvn test|gradle test|\./gradlew test|dotnet test|bundle exec rspec|rspec|php artisan test|vendor/bin/phpunit)( |$)'
UNSAFE_RE='[;&|<>`]|\$\(|\$\{'

if [[ "$cmd" =~ $TEST_RE ]] && ! [[ "$cmd" =~ $UNSAFE_RE ]] && [[ "$cmd" != *$'\n'* ]]; then
  log="${TMPDIR:-/tmp}/claude-ultimo-teste.log"
  filtered="{ $cmd ; } > '$log' 2>&1; rc=\$?; \
grep -E -A 5 '(FAIL|ERROR|Error:|error:|failed|Failed|panic:|not ok|✗|✕|✖)' '$log' | head -n 80; \
echo '--- final da saída ---'; tail -n 8 '$log'; \
echo \"[exit code: \$rc | saída completa em $log]\"; exit \$rc"

  printf '%s' "$input" | jq --arg c "$filtered" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      updatedInput: (.tool_input + {command: $c})
    }
  }'
else
  echo '{}'
fi
