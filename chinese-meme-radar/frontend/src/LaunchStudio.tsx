import { useEffect, useState } from 'react'

export interface LaunchSelection { title: string; url: string; name: string | null }
interface Draft {
  source_title: string; source_url: string; name: string; ticker: string; description: string;
  tweet_text: string; first_post_url: string; logo_asset: string; creator_address: string;
  buy_tax_bps: number; sell_tax_bps: number; distribution: 'recipient' | 'dividend' | null;
  beneficiary: string; tax_days: number | null; anti_farmer_days: number | null;
  minimum_dividend_tokens: string; initial_buy_bnb: string; wallet_buy_bnb: string; metadata_cid: string;
}
const emptyDraft: Draft = { source_title:'', source_url:'', name:'', ticker:'', description:'', tweet_text:'',
  first_post_url:'', logo_asset:'', creator_address:'', buy_tax_bps:200, sell_tax_bps:200, distribution:null,
  beneficiary:'', tax_days:null, anti_farmer_days:null, minimum_dividend_tokens:'0', initial_buy_bnb:'0',
  wallet_buy_bnb:'', metadata_cid:'' }
async function request(path: string, body?: unknown) {
  const response = await fetch(path, body === undefined ? undefined : { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) {
    const detail = data.detail
    throw new Error(typeof detail === 'string' ? detail : detail?.missing ? `${detail.message} Missing: ${detail.missing.join(', ')}` : 'Check the draft fields and try again.')
  }
  return data
}

export default function LaunchStudio({selection}: {selection: LaunchSelection | null}) {
  const [draft,setDraft] = useState<Draft>(emptyDraft)
  const [logoUrl,setLogoUrl] = useState('')
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('Choose a trend or reference below to start a launch draft.')
  const [brief,setBrief] = useState('')
  const [missing,setMissing] = useState<string[]>([])
  const [connection,setConnection] = useState<{connected:boolean; block?:string; error?:string; portal?:string} | null>(null)
  const [postLength,setPostLength] = useState<number | null>(null)
  const [transaction,setTransaction] = useState<object | null>(null)

  useEffect(() => {
    if (!selection) return
    const name = selection.name ?? ''
    const next = {...emptyDraft, source_title:selection.title, source_url:selection.url, name, ticker:name.slice(0,8),
      description:name ? `灵感来自“${name}”相关内容。独立社区创作。` : '',
      tweet_text:name ? `${name}\n灵感来自原始内容，记录这个有趣的瞬间。\n${selection.url}` : '',
      logo_asset:name === '黑柴' ? 'concept:black-shiba' : ''}
    void Promise.resolve().then(() => {
      setDraft(next); setLogoUrl(name === '黑柴' ? '/concepts/black-shiba-concept.png' : ''); setTransaction(null); setPostLength(null)
      setMessage('Draft selected. Review the subject, logo and post before preparing deployment.')
      request('/api/studio/draft',next).then(p => {setBrief(p.image_brief); setMissing(p.missing)}).catch(e=>setMessage(e.message))
    })
  },[selection])

  function update<K extends keyof Draft>(key:K,value:Draft[K]) {
    if (key === 'name' && draft.logo_asset === 'concept:black-shiba' && value !== '黑柴') { setLogoUrl(''); setBrief('') }
    setDraft(previous=>({...previous,[key]:value,...(key === 'name' && previous.logo_asset === 'concept:black-shiba' && value !== '黑柴' ? {logo_asset:'', metadata_cid:''} : {}),...(['first_post_url','creator_address','logo_asset','description'].includes(key) ? {metadata_cid:''} : {})}))
    setTransaction(null)
    if (key === 'tweet_text') setPostLength(null)
  }
  async function act(operation:()=>Promise<void>) {
    setBusy(true)
    try { await operation() } catch(error) { setMessage(error instanceof Error ? error.message : 'Request failed.') }
    finally { setBusy(false) }
  }
  async function validateDraft() {
    const preview = await request('/api/studio/draft',draft)
    setBrief(preview.image_brief); setMissing(preview.missing)
    if (draft.tweet_text.trim()) { const post = await request('/api/studio/post-preview',{text:draft.tweet_text}); setPostLength(post.weightedLength) }
    setMessage(preview.missing.length ? 'Draft checked. Complete the missing steps below.' : 'Draft fields complete. Ready for unsigned preparation.')
  }
  async function upload(file:File) {
    if (file.type !== 'image/png' || file.size > 3*1024*1024) throw new Error('Choose a PNG image smaller than 3 MB.')
    const dataUrl = await new Promise<string>((resolve,reject)=> { const reader = new FileReader(); reader.onload=()=>resolve(String(reader.result)); reader.onerror=()=>reject(new Error('Image could not be read.')); reader.readAsDataURL(file) })
    const result=await request('/api/studio/logo',{data_url:dataUrl})
    update('logo_asset',result.logo_asset); setLogoUrl(result.url); setMessage('Logo saved locally. It has not been uploaded to Flap.')
  }
  function downloadPlan() {
    const payload=transaction ?? {mode:'draft',...draft,image_brief:brief,quote_asset:'BNB',signed:false,broadcast:false}
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}))
    const anchor=document.createElement('a'); anchor.href=url; anchor.download='flap-launch-plan.json'; anchor.click(); URL.revokeObjectURL(url)
  }

  return <section className="launch-studio" id="launch-studio">
    <div className="studio-heading"><div><span className="studio-eyebrow">BNB · Tax Token · 10 Buy Wallets</span><h3>Launch Studio</h3><p>Select a source → create a post and logo → prepare a Flap deployment</p></div>
      <div className="studio-actions"><a className="studio-secondary" href="#flap-tax-settings">Deployment Settings ↓</a><a className="studio-secondary" href="https://flap.sh/launch" target="_blank" rel="noopener noreferrer">Open Flap Launch ↗</a></div></div>
    <div className="studio-connection"><span>{connection?.connected ? `✓ BSC Portal connected · Block ${connection.block}` : connection?.error ?? 'Flap RPC connection has not been checked.'}</span>
      <button disabled={busy} onClick={()=>act(async()=>{const result=await request('/api/studio/connection'); setConnection(result);setMessage(result.connected ? 'Portal code found on BSC. This is a read-only check; no transaction was sent.' : result.error ?? 'Portal check failed.')})}>Check Flap Connection</button></div>
    <fieldset disabled={busy} className="studio-fields">
      <div className="studio-grid">
        <div>
          <h4>1 · Subject & First Post</h4>
          <p className="studio-source">{draft.source_title || 'No subject selected'} {draft.source_url && <a href={draft.source_url} target="_blank" rel="noopener noreferrer">View source ↗</a>}</p>
          <div className="studio-row"><label>Token name<input value={draft.name} maxLength={32} onChange={e=>update('name',e.target.value)}/></label><label>Token symbol<input value={draft.ticker} maxLength={8} onChange={e=>update('ticker',e.target.value)}/></label></div>
          <label>Description<textarea value={draft.description} maxLength={512} onChange={e=>update('description',e.target.value)}/></label>
          <label>First post draft<textarea className="studio-tweet" value={draft.tweet_text} onChange={e=>update('tweet_text',e.target.value)}/></label>
          <div className="studio-actions"><button type="button" onClick={()=>act(validateDraft)}>Validate Draft & Post</button><span>{postLength === null ? 'Weighted X limit: 280' : `${postLength} / 280 weighted characters`}</span>
            {postLength !== null && <a href={`https://x.com/intent/post?text=${encodeURIComponent(draft.tweet_text)}`} target="_blank" rel="noopener noreferrer">Open X Composer ↗</a>}</div>
          <label>Published first-post URL<input placeholder="https://x.com/your_account/status/..." value={draft.first_post_url} onChange={e=>update('first_post_url',e.target.value)}/></label>
          <small>Publishing credentials are not connected. The composer lets you review and publish from your own account; paste the resulting URL here.</small>
        </div>
        <div>
          <h4>2 · Logo</h4>
          <div className="studio-logo">{logoUrl ? <img src={logoUrl} alt={`${draft.name || 'Token'} draft logo`}/> : <div>Choose the actual subject before creating its image.</div>}</div>
          {draft.logo_asset === 'concept:black-shiba' && <p className="studio-caption">AI-generated Black Shiba concept · Draft only · Select another subject to prepare its own artwork</p>}
          <label>Upload your logo · PNG, up to 3 MB<input type="file" accept="image/png" onChange={e=>{const file=e.target.files?.[0];if(file)void act(()=>upload(file))}}/></label>
          <label>Image generation brief<textarea className="studio-image-brief" readOnly value={brief}/></label>
          <div className="studio-actions"><button type="button" onClick={()=>act(async()=>{const result=await request('/api/studio/draft',draft);setBrief(result.image_brief);setMissing(result.missing);setMessage('Image brief updated for this subject.')})}>Update Image Brief</button>
            <button type="button" disabled={!brief} onClick={()=>act(async()=>{await navigator.clipboard.writeText(brief);setMessage('Image brief copied. Use it in this chat to generate the selected artwork, then upload the PNG.')})}>Copy Image Brief</button>
            {logoUrl && <a href={logoUrl} download="token-logo.png">Download Logo ↓</a>}</div>
          <small>Generate a subject-specific image through Codex, or upload your own. Website-triggered image generation is not connected yet.</small>
        </div>
      </div>
      <h4 id="flap-tax-settings">3 · Flap Tax Settings</h4>
      <div className="studio-row studio-tax-row">
        <label>Buy tax %<input type="number" min="0" max="10" step="0.01" value={draft.buy_tax_bps/100} onChange={e=>update('buy_tax_bps',Math.round(Number(e.target.value)*100))}/></label>
        <label>Sell tax %<input type="number" min="0" max="10" step="0.01" value={draft.sell_tax_bps/100} onChange={e=>update('sell_tax_bps',Math.round(Number(e.target.value)*100))}/></label>
        <label>Revenue allocation<select value={draft.distribution ?? ''} onChange={e=>update('distribution',e.target.value as Draft['distribution'])}><option value="">Choose allocation</option><option value="recipient">100% recipient allocation</option><option value="dividend">100% BNB dividend allocation</option></select></label>
        <label>Launch wallet address<input placeholder="0x..." value={draft.creator_address} onChange={e=>update('creator_address',e.target.value)}/></label>
      </div>
      <div className="studio-row studio-tax-row">
        {draft.distribution === 'recipient' && <label>Tax recipient address<input placeholder="0x..." value={draft.beneficiary} onChange={e=>update('beneficiary',e.target.value)}/></label>}
        {draft.distribution === 'dividend' && <label>Minimum tokens for dividends<input value={draft.minimum_dividend_tokens} onChange={e=>update('minimum_dividend_tokens',e.target.value)}/></label>}
        <label>Tax duration · days<input type="number" min="365" max="36500" placeholder="Choose duration" value={draft.tax_days ?? ''} onChange={e=>update('tax_days',e.target.value ? Number(e.target.value) : null)}/></label>
        <label>Anti-farmer period · days<input type="number" min="0" max="365" placeholder="0–365 days" value={draft.anti_farmer_days ?? ''} onChange={e=>update('anti_farmer_days',e.target.value ? Number(e.target.value) : null)}/></label>
        <label>Creator launch buy · BNB<input value={draft.initial_buy_bnb} onChange={e=>update('initial_buy_bnb',e.target.value)}/></label>
        <label>Each of 10 buy wallets · BNB<input placeholder="Budget not selected" value={draft.wallet_buy_bnb} onChange={e=>update('wallet_buy_bnb',e.target.value)}/></label>
      </div>
      <p className="studio-caption">These are allocation settings; actual tax routing and protocol fees still require on-chain simulation. No wallets are unlocked by this screen.</p>
      <div className="studio-actions studio-footer">
        <button type="button" onClick={()=>act(async()=>{const result=await request('/api/studio/metadata',draft);setDraft(previous=>({...previous,metadata_cid:result.metadata_cid}));setMessage(result.detail)})}>Pin Logo & Post Link to Flap</button>
        {draft.metadata_cid && <button type="button" onClick={()=>act(async()=>{const result=await request('/api/studio/metadata/verify',draft);setMessage(result.detail)})}>Verify Pinned Metadata</button>}
        <button type="button" className="studio-primary" onClick={()=>act(async()=>{const result=await request('/api/deploy/prepare',draft);setTransaction(result);setMessage('Unsigned Flap transaction prepared. Nothing was signed or sent.')})}>Prepare Flap Deployment</button>
        <button type="button" onClick={downloadPlan}>Download Launch Plan ↓</button>
        <button type="button" disabled title="Signing, simulation and complete wallet configuration are still required">Live Deploy · Not Enabled</button>
      </div>
    </fieldset>
    <div className="studio-message" role="status">{busy ? 'Preparing…' : message}</div>
    {missing.length > 0 && <p className="studio-missing">Still needed: {missing.join(' · ')}</p>}
    {transaction && <details><summary>Unsigned transaction details</summary><pre>{JSON.stringify(transaction,null,2)}</pre></details>}
  </section>
}
