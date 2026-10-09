#!/usr/bin/env bash

# ERC-20 deposit dapp for the emergency withdrawal tests. It keeps the balances
# in the accounts drive, using the account layout of the USD withdrawal output
# builder. It doesn't know where its accounts drive is or how large it is: it
# looks the drive up by label, so only the layout the CLI derives makes its funds
# recoverable.
#
# ACCOUNTS_LABEL is the label of the accounts drive. ACCOUNTS_SIZE, when set, is
# the size of the accounts at the beginning of a larger drive.

ACCOUNT_SIZE=32
ZERO_RECORD=0000000000000000000000000000000000000000000000000000000000000000

accounts_label="${ACCOUNTS_LABEL:?ACCOUNTS_LABEL must name the accounts drive}"
accounts_size="${ACCOUNTS_SIZE:-$(memoryrange --length "$accounts_label")}"
max_accounts=$((accounts_size / ACCOUNT_SIZE))

trusted_portal="$(printf '%s' "${TRUSTED_ERC20_PORTAL:-}" | tr 'A-F' 'a-f' | sed 's/^0x//')"
trusted_token="$(printf '%s' "${TRUSTED_ERC20_TOKEN:-}" | tr 'A-F' 'a-f' | sed 's/^0x//')"

report() {
  printf '{"payload":"0x%s"}\n' "$1" | rollup report >/dev/null
}

reverse_bytes() {
  printf '%s' "$1" | fold -w2 | tac | tr -d '\n'
}

uint64_be_to_dec() {
  printf '%d' "0x$1"
}

uint64_dec_to_le() {
  reverse_bytes "$(printf '%016x' "$1")"
}

# nvrams can only be accessed through mmap, which these tools do for both kinds
read_record() {
  readmmap "$accounts_label" $(($1 * ACCOUNT_SIZE)) "$ACCOUNT_SIZE" | xxd -p -c "$ACCOUNT_SIZE"
}

write_record() {
  printf '%s' "$2" | xxd -r -p | writemmap "$accounts_label" $(($1 * ACCOUNT_SIZE)) "$ACCOUNT_SIZE"
}

record_address() {
  printf '%s' "${1:24:40}"
}

record_balance() {
  uint64_be_to_dec "$(reverse_bytes "${1:0:16}")"
}

encode_record() {
  # positive int64 values, zero-extended in the uint96 balance of LibUsdAccount
  printf '%s00000000%s' "$(uint64_dec_to_le "$1")" "$2"
}

# prints the index of the account, or of the first free record if it has none
find_account_index() {
  local address="$1"
  local i record
  for ((i = 0; i < max_accounts; i++)); do
    record="$(read_record "$i")"
    if [[ "$record" == "$ZERO_RECORD" ]]; then
      printf '%d' "$i"
      return 1
    fi
    if [[ "$(record_address "$record")" == "$address" ]]; then
      printf '%d' "$i"
      return 0
    fi
  done
  return 2
}

credit_account() {
  local address="$1"
  local amount="$2"
  local idx status balance=0

  idx="$(find_account_index "$address")"
  status=$?
  if [[ "$status" -eq 2 ]]; then
    return 1
  fi
  if [[ "$status" -eq 0 ]]; then
    balance="$(record_balance "$(read_record "$idx")")"
  fi
  write_record "$idx" "$(encode_record $((balance + amount)) "$address")"
}

handle_erc20_deposit() {
  local msg_sender="$1"
  local payload="$2"
  local token sender amount_hex amount

  [[ -n "$trusted_portal" && -n "$trusted_token" ]] || return 1
  [[ "$msg_sender" == "$trusted_portal" ]] || return 1
  [[ ${#payload} -ge 144 ]] || return 1

  token="${payload:0:40}"
  sender="${payload:40:40}"
  amount_hex="${payload:80:64}"
  [[ "$token" == "$trusted_token" ]] || return 1
  [[ "${amount_hex:0:49}" =~ ^0{48}[0-7]$ ]] || return 1

  amount="$(uint64_be_to_dec "${amount_hex:48:16}")"
  (( amount > 0 )) || return 1
  credit_account "$sender" "$amount"
}

request="$(rollup accept)"
while true; do
  printf '%s\n' "$request" >/tmp/request.json
  request_type="$(jq -r .request_type /tmp/request.json)"

  if [[ "$request_type" != "advance_state" ]]; then
    request="$(rollup accept)"
    continue
  fi

  msg_sender="$(jq -r .data.msg_sender /tmp/request.json | tr 'A-F' 'a-f' | sed 's/^0x//')"
  payload="$(jq -r .data.payload /tmp/request.json | tr 'A-F' 'a-f' | sed 's/^0x//')"

  if handle_erc20_deposit "$msg_sender" "$payload"; then
    report 6465706f736974206f6b
    request="$(rollup accept)"
  else
    report 62616420696e707574
    request="$(rollup reject)"
  fi
done
