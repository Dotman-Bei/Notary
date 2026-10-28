import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createWalletClient, custom, type Address, type EIP1193Provider } from 'viem'
import { botChain, CHAIN_ID, CHAIN_ID_HEX, EXPLORER, RPC_URL } from './chain'

declare global {
  interface Window { ethereum?: EIP1193Provider }
}

interface Wallet {
  available: boolean
  account: Address | null
  chainId: number | null
  onBotChain: boolean
  connecting: boolean
  error: string | null
  connect: () => Promise<void>
  switchChain: () => Promise<void>
  client: () => ReturnType<typeof createWalletClient> | null
}

const Ctx = createContext<Wallet | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const eth = typeof window !== 'undefined' ? window.ethereum : undefined
  const [account, setAccount] = useState<Address | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!eth) return
    eth.request({ method: 'eth_accounts' }).then((a) => setAccount((a[0] as Address) ?? null)).catch(() => {})
    eth.request({ method: 'eth_chainId' }).then((c) => setChainId(parseInt(c, 16))).catch(() => {})
    const onAccounts = (a: string[]) => setAccount((a[0] as Address) ?? null)
    const onChain = (c: string) => setChainId(parseInt(c, 16))
    eth.on('accountsChanged', onAccounts)
    eth.on('chainChanged', onChain)
    return () => { eth.removeListener('accountsChanged', onAccounts); eth.removeListener('chainChanged', onChain) }
  }, [eth])

  const connect = useCallback(async () => {
    if (!eth) return
    setConnecting(true); setError(null)
    try {
      const a = await eth.request({ method: 'eth_requestAccounts' })
      setAccount((a[0] as Address) ?? null)
    } catch (e) {
      setError((e as Error).message.split('\n')[0])
    } finally { setConnecting(false) }
  }, [eth])

  const switchChain = useCallback(async () => {
    if (!eth) return
    setError(null)
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] })
    } catch (e) {
      // 4902: the wallet does not know BOT Chain yet. Adding it needs an RPC URL, which comes from config only.
      if ((e as { code?: number }).code === 4902 && RPC_URL) {
        await eth.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN_ID_HEX, chainName: 'BOT Chain Mainnet', nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 }, rpcUrls: [RPC_URL], blockExplorerUrls: [EXPLORER] }] })
      } else setError((e as Error).message.split('\n')[0])
    }
  }, [eth])

  const client = useCallback(() => (eth && account ? createWalletClient({ account, chain: botChain, transport: custom(eth) }) : null), [eth, account])

  const value = useMemo<Wallet>(() => ({
    available: Boolean(eth), account, chainId, onBotChain: chainId === CHAIN_ID, connecting, error, connect, switchChain, client,
  }), [eth, account, chainId, connecting, error, connect, switchChain, client])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWallet() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useWallet outside WalletProvider')
  return v
}
