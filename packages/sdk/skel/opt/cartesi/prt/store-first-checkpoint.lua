-- Stores the checkpoint crisium starts epoch 0 from: the template machine with
-- an empty output history and the geometry of the application's tournament
-- factory, read from the chain the way the player reads it. The player never
-- creates this checkpoint itself, so the init service of a crisium node runs
-- this before the player starts. It needs LUA_PATH to find the recipes.
-- Usage: lua5.4 store-first-checkpoint.lua RPC APPLICATION TEMPLATE DAVE DIRECTORY
local rpc_url, application, template, dave, directory = ...
local evmu = require("cartesi.evmu")
local rpc_client = require("prt-rpc")
local eth = require("prt-ethereum")
local bridge = require("prt-bridge")
local stored_player = require("prt-stored-player")
local chain = rpc_client.new(rpc_url)
local function artifact(subdirectory, name)
    return (eth.artifact(dave .. "/" .. subdirectory .. "/contracts/out", name))
end
local abi = eth.abi({
    artifact("cartesi-rollups", "Application"),
    artifact("cartesi-rollups", "DaveConsensus"),
    artifact("cartesi-rollups", "InputBox"),
    artifact("prt", "Tournament"),
    artifact("prt", "MultiLevelTournamentFactory"),
})
local function call(address, name, types)
    return evmu.decode_abi(types, assert(eth.raw(assert(chain:call(address, abi:calldata(name, {}))))))[1]
end
local consensus = call(application:lower(), "getOutputsMerkleRootValidator", "(address)"):lower()
local factory = call(consensus, "getTournamentFactory", "(address)"):lower()
stored_player.store_first_epoch_checkpoint(template, bridge.read_geometry(chain, abi, factory), directory)
