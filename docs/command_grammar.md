# Command Grammar Specification

## Syntax
Commands follow a standard CLI syntax:
`command [subcommand] [args...] [--flag value] [-f]`

### EBNF
```ebnf
command_line = command_name , { whitespace , argument } ;
command_name = letter , { letter | digit | "-" } ;
argument     = positional | flag ;
positional   = value ;
flag         = long_flag | short_flag ;
long_flag    = "--" , flag_name , [ "=" , value ] ;
short_flag   = "-" , flag_char ;
value        = number | string | boolean ;
string       = '"' , { character } , '"' | "'" , { character } , "'" | non_space_string ;
```

## Supported Commands

### 1. Connection
- `connect`: Connects to default injected wallet.
- `connect --wallet [walletconnect|metamask]`: Specify wallet type.

### 2. Contract
- `contract load [address]`: Load a contract for analysis.
- `contract info`: Show details of loaded contract.

### 3. Gas
- `gas auto`: Use automatic network suggestions.
- `gas set --max [gwei] --priority [gwei]`: Set custom fixed gas.

### 4. Splitting/Sniping
- `snipe start --qty [n]`: Start monitoring and execute when mint opens.
- `snipe stop`: Abort monitoring.
- `mint [qty]`: Immediate manual mint (bypass monitoring logic).

### 5. Utility
- `clear`: Clear terminal.
- `help`: Show help.
- `history`: Show command history.
