type FighterArtworkProps = { side: "player" | "opponent"; opponentNumber: number; name: string };

const S = { ink: "#05080d", fabric: "#10151d", armor: "#263746", steel: "#718096", pale: "#d9e2ea", cyan: "#22d3ee", magenta: "#d946ef" };

function PlayerArtwork({ name }: { name: string }) {
  return <svg className="fighter-svg fighter-art-player" viewBox="0 0 220 360" role="img" aria-label={name}>
    <defs>
      <linearGradient id="heroSkin" x1="0" x2="1"><stop stopColor="#d69b78"/><stop offset=".55" stopColor="#b9785f"/><stop offset="1" stopColor="#75493f"/></linearGradient>
      <linearGradient id="heroMetal" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#647789"/><stop offset=".48" stopColor="#263746"/><stop offset="1" stopColor="#101820"/></linearGradient>
    </defs>
    <ellipse className="fighter-ground-shadow" cx="110" cy="334" rx="66" ry="9"/>
    <g className="art-body hero-body">
      <g className="art-leg art-leg-back hero-leg-left">
        <path d="M91 220 Q79 248 77 278 L91 284 108 245 110 221Z" fill={S.fabric} stroke={S.ink} strokeWidth="4"/>
        <path d="M79 244 Q84 257 99 260 L92 281 76 278Z" fill="#1d2935"/><path d="M75 276 L94 278 96 294 75 296 68 287Z" fill="#303f4b" stroke={S.ink} strokeWidth="3"/>
        <path d="M73 291 L96 291 91 323 60 325 60 316 72 308Z" fill="#141c24" stroke={S.ink} strokeWidth="4"/>
        <path d="M61 317 L92 316 96 326 58 329Z" fill="#05080d"/><path d="M68 300 L91 297 88 303 67 306Z" fill="#8ea0ad"/>
      </g>
      <g className="art-leg art-leg-front hero-leg-right">
        <path d="M112 219 Q128 238 139 271 L127 282 106 249 101 224Z" fill="#151d27" stroke={S.ink} strokeWidth="4"/>
        <path d="M116 241 L137 267 128 281 111 260Z" fill="#263746"/><path d="M126 272 L143 268 153 281 144 293 125 290Z" fill="#344654" stroke={S.ink} strokeWidth="3"/>
        <path d="M128 287 L150 282 170 310 164 320 128 319 122 308Z" fill="#17212b" stroke={S.ink} strokeWidth="4"/>
        <path d="M126 312 L166 312 173 320 165 325 127 324Z" fill="#05080d"/><path d="M137 292 L153 296 158 303 135 300Z" fill="#9aabb7"/>
      </g>
      <g className="hero-pelvis">
        <path d="M79 190 L137 190 143 215 126 229 91 226 75 211Z" fill="#101820" stroke={S.ink} strokeWidth="4"/>
        <path d="M83 194 L105 198 102 218 87 216Z" fill="#344654"/><path d="M108 198 L136 194 132 216 112 220Z" fill="#263746"/>
        <path d="M76 190 L140 190 136 202 82 203Z" fill="#596b78"/><path d="M101 190 L117 190 120 205 108 211 99 203Z" fill="#111827" stroke="#93a4af" strokeWidth="2"/>
        <path d="M83 202 L72 210 69 197 80 190Z" fill="#273846"/><path d="M137 201 L151 207 150 219 136 214Z" fill="#1d2d39"/><circle cx="145" cy="212" r="5" fill={S.cyan}/>
      </g>
      <g className="hero-torso">
        <path d="M82 99 Q108 89 133 103 L148 133 139 192 79 192 70 135Z" fill={S.fabric} stroke={S.ink} strokeWidth="5"/>
        <path d="M83 105 L105 98 108 143 81 137 73 125Z" fill="#344654" stroke="#617585" strokeWidth="2"/>
        <path d="M110 98 L132 105 144 126 113 142Z" fill="#273846" stroke="#526775" strokeWidth="2"/>
        <path d="M87 143 L106 148 104 184 82 179Z" fill="#18232d"/><path d="M111 146 L136 136 134 180 111 185Z" fill="#1d2a35"/>
        <path d="M104 104 L113 103 116 139 109 145 104 137Z" fill="#0a1118"/><path d="M106 110 L112 108 113 132 108 136Z" fill={S.cyan}/>
        <path d="M79 154 L101 159 M115 159 L137 151 M91 174 L102 176 M116 175 L132 170" stroke="#536878" strokeWidth="2"/>
        <path d="M125 108 L138 114 135 120 123 115Z" fill={S.magenta}/><circle cx="95" cy="115" r="2" fill={S.pale}/><circle cx="128" cy="169" r="2.5" fill={S.cyan}/>
        <path d="M87 130 L99 126 M119 122 L133 128 M88 165 L98 168" stroke="#91a4b2" strokeWidth="1.2" opacity=".7"/><path d="M77 142 L82 144 M135 147 L141 143" stroke="#05080d" strokeWidth="2"/>
      </g>
      <g className="art-arm hero-arm-left">
        <path d="M78 106 Q64 108 55 124 L47 154 63 160 84 128Z" fill="#18232d" stroke={S.ink} strokeWidth="4"/>
        <path d="M68 107 L53 116 49 131 70 128 82 114Z" fill="#354957" stroke="#78909f" strokeWidth="2"/>
        <path d="M49 151 L64 155 61 169 46 169 40 161Z" fill="#0d141b" stroke={S.ink} strokeWidth="3"/>
        <path d="M45 166 L62 166 60 199 43 203 35 195Z" fill="url(#heroMetal)" stroke={S.ink} strokeWidth="4"/>
        <path d="M43 174 L59 171 56 178 43 182Z" fill={S.cyan}/><path d="M37 198 L58 195 62 206 52 214 39 209Z" fill="url(#heroSkin)" stroke={S.ink} strokeWidth="3"/>
        <path d="M38 205 L51 202 58 207 50 212 40 210Z" fill="#c68a6c"/>
      </g>
      <g className="art-arm hero-arm-right">
        <path d="M132 105 Q148 108 157 124 L170 143 157 153 134 132Z" fill="#18232d" stroke={S.ink} strokeWidth="4"/>
        <path d="M137 110 L151 116 158 132 146 137 132 125Z" fill="#263746"/><path d="M158 140 L172 137 181 151 171 163 158 156Z" fill="#0d141b" stroke={S.ink} strokeWidth="3"/>
        <path d="M170 157 L183 148 194 164 183 181 168 172Z" fill="url(#heroMetal)" stroke={S.ink} strokeWidth="4"/>
        <path d="M175 160 L187 155 190 161 177 168Z" fill={S.cyan}/><path d="M182 176 L194 163 201 171 195 185 184 187Z" fill="url(#heroSkin)" stroke={S.ink} strokeWidth="3"/>
        <path d="M192 167 L204 174 200 181 192 177Z" fill="#d49a78"/>
        <g className="hero-blaster">
          <path d="M190 151 L203 147 211 161 205 178 197 177 194 166 186 161Z" fill="#111820" stroke={S.ink} strokeWidth="3"/>
          <path d="M195 143 L211 137 218 144 216 163 204 166 195 158Z" fill="#344654" stroke={S.ink} strokeWidth="3"/>
          <path d="M201 145 L209 142 214 147 211 156 203 156Z" fill={S.cyan} stroke="#cffafe" strokeWidth="1.5"/>
          <path d="M210 137 L218 136 219 142 210 145Z" fill="#8da1af"/><path d="M215 146 L223 146 224 157 216 159Z" fill="#17232c" stroke={S.ink} strokeWidth="2"/>
          <path d="M219 149 L226 150 226 155 219 156Z" fill={S.pale}/><path d="M198 167 L207 164 209 171 202 176Z" fill="#586b79"/>
          <circle cx="199" cy="151" r="2" fill={S.magenta}/><path d="M196 143 L205 139" stroke={S.pale} strokeWidth="2"/>
        </g>
      </g>
      <g className="hero-neck"><path d="M96 91 L124 91 127 107 115 115 96 106Z" fill="url(#heroSkin)" stroke={S.ink} strokeWidth="4"/><path d="M97 99 L124 99 121 108 106 110Z" fill="#70463d"/></g>
      <g className="hero-head">
        <path d="M91 42 Q108 27 126 39 L138 57 134 84 121 99 99 96 87 78Z" fill="url(#heroSkin)" stroke={S.ink} strokeWidth="4"/>
        <path d="M91 43 Q101 25 123 31 L137 43 131 54 113 48 99 57 88 65 83 53Z" fill="#11151c"/>
        <path d="M92 40 Q103 26 119 31 L110 44 96 51Z" fill="#28303a"/><path d="M119 31 Q139 33 143 45 L132 57 126 45Z" fill="#070a0f"/>
        <path d="M85 51 Q77 43 82 34 L98 46Z" fill="#151b23"/><path d="M82 39 L72 32 82 50Z" fill="#29323c"/>
        <path d="M103 61 L119 59 125 67 118 70 124 76 117 87 101 85 96 76Z" fill="#c5896b"/>
        <path d="M103 62 L115 60" stroke="#4a302e" strokeWidth="3"/><path d="M120 71 L128 74 120 77" fill="#815145"/><path d="M105 86 Q114 90 121 84" fill="none" stroke="#593735" strokeWidth="2"/>
        <path d="M128 55 L139 58 139 72 130 78 125 69Z" fill="#18242d" stroke={S.ink} strokeWidth="2"/><circle cx="134" cy="63" r="3" fill={S.cyan}/><path d="M137 70 L143 77" stroke="#708694" strokeWidth="2"/>
      </g>
    </g>
  </svg>;
}

function Joint({ cx, cy, r = 7, accent = "#22d3ee" }: { cx:number; cy:number; r?:number; accent?:string }) {
  return <g className="robot-joint"><circle cx={cx} cy={cy} r={r+3} fill="#080c11"/><circle cx={cx} cy={cy} r={r} fill="#33404a" stroke="#778691" strokeWidth="2"/><circle cx={cx} cy={cy} r={Math.max(2,r-4)} fill={accent}/></g>;
}

function Pulse({ name }: { name:string }) {
  return <svg className="fighter-svg fighter-art-pulse" viewBox="0 0 220 360" role="img" aria-label={name}>
    <ellipse className="fighter-ground-shadow" cx="114" cy="334" rx="58" ry="7"/>
    <g className="robot-body pulse-body">
      <g className="robot-leg pulse-leg-left"><path d="M87 213 L107 215 99 265 82 270 76 249Z" fill="#26323b" stroke="#080b10" strokeWidth="4"/><Joint cx={91} cy={267}/><path d="M82 272 L99 270 96 315 75 316 72 298Z" fill="#34434d" stroke="#080b10" strokeWidth="4"/><path d="M73 311 L99 311 104 325 66 328 62 321Z" fill="#141b21" stroke="#080b10" strokeWidth="3"/><path d="M80 283 L94 281" stroke="#8da0ab" strokeWidth="2"/></g>
      <g className="robot-leg pulse-leg-right"><path d="M116 214 L137 209 147 258 132 267 116 248Z" fill="#303f49" stroke="#080b10" strokeWidth="4"/><Joint cx={139} cy={264}/><path d="M132 270 L149 264 159 310 139 314 129 293Z" fill="#26343e" stroke="#080b10" strokeWidth="4"/><path d="M138 309 L161 306 178 320 174 327 136 326Z" fill="#141b21" stroke="#080b10" strokeWidth="3"/><path d="M139 278 L151 276" stroke="#22d3ee" strokeWidth="2"/></g>
      <g className="pulse-torso"><path d="M91 104 L132 101 148 124 141 194 119 215 89 207 73 183 77 124Z" fill="#121a20" stroke="#080b10" strokeWidth="5"/><path d="M80 118 L105 108 107 154 82 148Z" fill="#3a4851" stroke="#81919b" strokeWidth="2"/><path d="M110 107 L132 108 143 125 114 153Z" fill="#2b3942"/><path d="M83 157 L104 161 101 198 84 190Z" fill="#202b33"/><path d="M114 158 L138 145 135 188 116 204Z" fill="#26343c"/><path d="M103 119 L119 117 128 132 119 150 104 147 96 132Z" fill="#080d12" stroke="#657985" strokeWidth="3"/><circle cx="112" cy="133" r="7" fill="#67e8f9"/><circle cx="112" cy="133" r="3" fill="#fff"/><path d="M83 169 L99 169 M120 176 L135 169" stroke="#22d3ee" strokeWidth="2"/></g>
      <path className="pulse-surface-detail" d="M87 124 l10 -4 M121 181 l11 -6 M86 185 l9 3" stroke="#9cadb7" strokeWidth="1.3" opacity=".7"/>
      <g className="pulse-arm-left"><Joint cx={75} cy={119}/><path d="M72 119 L57 128 49 164 60 169 78 139Z" fill="#34434d" stroke="#080b10" strokeWidth="4"/><Joint cx={55} cy={169} r={6}/><path d="M50 174 L62 170 58 208 43 215 39 202Z" fill="#28353e" stroke="#080b10" strokeWidth="4"/><path d="M43 211 L58 205 65 214 59 224 43 222 37 216Z" fill="#182127" stroke="#080b10" strokeWidth="3"/><path d="M43 216 l-8 7 M51 219 l-3 10 M58 217 l4 8" stroke="#8b9aa3" strokeWidth="3"/></g>
      <g className="pulse-arm-right"><Joint cx={142} cy={117}/><path d="M145 117 L160 124 174 151 163 160 141 139Z" fill="#3a4851" stroke="#080b10" strokeWidth="4"/><Joint cx={169} cy={157} r={6}/><path d="M165 160 L179 150 199 173 194 202 176 207 166 184Z" fill="#283943" stroke="#080b10" strokeWidth="4"/><path d="M175 166 L193 165 200 176 196 185 176 181Z" fill="#152027"/><path d="M179 187 L197 183 202 202 194 213 176 209Z" fill="#3b4b55"/><path d="M186 190 L199 190 202 202 193 207 184 204Z" fill="#071017" stroke="#22d3ee" strokeWidth="2"/><path d="M187 194 L198 194 M187 198 L199 198 M186 202 L197 202" stroke="#67e8f9" strokeWidth="2"/></g>
      <g className="pulse-neck"><path d="M99 89 L124 87 127 105 117 111 99 105Z" fill="#111920" stroke="#080b10" strokeWidth="4"/><path d="M104 90 L107 106 M117 89 L119 106" stroke="#778791" strokeWidth="3"/></g>
      <g className="pulse-head"><path d="M86 51 L128 40 145 55 139 85 122 99 91 91 78 73Z" fill="#1e2a32" stroke="#080b10" strokeWidth="5"/><path d="M91 50 L128 44 140 55 129 64 88 67 79 62Z" fill="#46555f"/><path d="M84 66 L137 59 134 78 91 82 80 74Z" fill="#070b10"/><path d="M91 69 L130 65 128 72 94 76Z" fill="#67e8f9"/><path d="M91 84 L130 79 121 94 96 91Z" fill="#303e47"/><circle cx="137" cy="67" r="2" fill="#dbe7ed"/><circle cx="136" cy="74" r="1.5" fill="#22d3ee"/></g>
    </g>
  </svg>;
}

function Bastion({ name }: { name:string }) {
  return <svg className="fighter-svg fighter-art-bastion" viewBox="0 0 220 360" role="img" aria-label={name}>
    <ellipse className="fighter-ground-shadow shadow-heavy" cx="110" cy="331" rx="82" ry="11"/>
    <g className="robot-body bastion-body">
      <g className="bastion-leg-left"><path d="M65 215 L105 215 102 267 67 271 55 245Z" fill="#4a4039" stroke="#0b0908" strokeWidth="5"/><path d="M66 259 L101 256 108 274 96 286 66 281 56 270Z" fill="#211d1a"/><circle cx="83" cy="270" r="11" fill="#151312" stroke="#8d7665" strokeWidth="3"/><path d="M62 281 L99 281 101 317 52 319 48 302Z" fill="#3a3430" stroke="#0b0908" strokeWidth="5"/><path d="M49 313 L102 312 109 329 43 330 37 322Z" fill="#171514"/></g>
      <g className="bastion-leg-right"><path d="M112 215 L155 210 168 257 151 271 116 263Z" fill="#50433a" stroke="#0b0908" strokeWidth="5"/><path d="M123 255 L161 250 171 265 161 282 130 283 117 269Z" fill="#241e1a"/><circle cx="148" cy="269" r="11" fill="#151312" stroke="#8d7665" strokeWidth="3"/><path d="M129 280 L164 277 180 312 170 321 124 316 119 297Z" fill="#403832" stroke="#0b0908" strokeWidth="5"/><path d="M124 310 L176 310 190 325 181 331 123 326Z" fill="#171514"/></g>
      <g className="bastion-torso"><path d="M48 96 L165 94 188 125 177 201 151 224 67 221 37 195 31 127Z" fill="#28231f" stroke="#0b0908" strokeWidth="6"/><path d="M39 111 L92 99 100 151 45 147Z" fill="#5c4b40" stroke="#9c806b" strokeWidth="3"/><path d="M103 98 L159 104 179 125 119 151Z" fill="#493b33"/><path d="M44 154 L96 158 93 207 57 203 40 185Z" fill="#3b312b"/><path d="M110 157 L174 143 166 193 145 211 111 204Z" fill="#342c27"/><path d="M91 108 L119 105 134 131 120 166 94 164 77 133Z" fill="#171311" stroke="#705948" strokeWidth="4"/><path d="M91 122 L119 119 124 134 116 147 94 146 86 133Z" fill="#8a351f"/><path d="M96 128 L118 126" stroke="#fb923c" strokeWidth="6"/><path d="M48 170 h35 M128 179 h35 M52 181 h29" stroke="#b44a27" strokeWidth="4"/><path d="M50 117 l18 -5 M145 111 l18 9" stroke="#c5b3a4" strokeWidth="2"/></g>
      <g className="bastion-arm-left"><path d="M31 100 L4 117 8 170 35 178 55 127Z" fill="#57473b" stroke="#0b0908" strokeWidth="6"/><path d="M8 123 L35 112 39 130 12 143Z" fill="#76604f"/><circle cx="31" cy="174" r="13" fill="#171413" stroke="#826c5a" strokeWidth="4"/><path d="M15 178 L45 172 55 221 35 243 5 228 1 200Z" fill="#443831" stroke="#0b0908" strokeWidth="6"/><path d="M9 191 L43 183 47 205 13 211Z" fill="#655044"/><path d="M12 216 L45 211 51 233 33 247 8 235Z" fill="#211c19"/><path d="M4 198 L0 223 M50 186 l9 29" stroke="#f97316" strokeWidth="3"/></g>
      <g className="bastion-arm-right"><path d="M167 98 L202 115 216 159 188 178 160 128Z" fill="#4a3d35" stroke="#0b0908" strokeWidth="6"/><path d="M178 106 L205 120 211 139 183 136Z" fill="#675346"/><circle cx="193" cy="174" r="13" fill="#171413" stroke="#826c5a" strokeWidth="4"/><path d="M180 178 L210 170 221 219 205 244 175 226 169 201Z" fill="#514137" stroke="#0b0908" strokeWidth="6"/><path d="M181 184 L207 178 214 202 179 210Z" fill="#725b4a"/><path d="M180 211 L214 204 218 227 202 244 178 229Z" fill="#201b18"/><path d="M187 216 L208 213 M190 222 L210 219 M193 228 L207 226" stroke="#fb923c" strokeWidth="3"/></g>
      <g className="bastion-head"><path d="M75 61 L142 59 158 83 148 109 69 109 56 83Z" fill="#2f2925" stroke="#0b0908" strokeWidth="6"/><path d="M67 67 L147 66 153 81 143 88 66 88 59 81Z" fill="#57483d"/><path d="M72 79 L143 77 139 95 74 96 65 88Z" fill="#0d0b0a"/><path d="M82 83 L133 82 130 89 85 90Z" fill="#f97316"/><path d="M72 98 L143 96 137 108 77 108Z" fill="#40362f"/></g>
      <path d="M52 121 l9 -3 M61 195 l12 -2 M158 118 l12 4" stroke="#d1b9a7" strokeWidth="2"/>
      <path className="bastion-surface-detail" d="M71 126 l13 -4 M126 118 l18 3 M74 188 l16 -2 M135 194 l14 -5" stroke="#171311" strokeWidth="2" opacity=".8"/>
    </g>
  </svg>;
}

function Oracle({ name }: { name:string }) {
  return <svg className="fighter-svg fighter-art-oracle" viewBox="0 0 220 360" role="img" aria-label={name}>
    <ellipse className="fighter-ground-shadow" cx="113" cy="335" rx="49" ry="6"/>
    <g className="robot-body oracle-body">
      <g className="oracle-sensor-rig"><path d="M142 69 Q176 61 181 91 L169 94 Q166 77 146 82Z" fill="#20243a" stroke="#070811" strokeWidth="3"/><circle cx="177" cy="89" r="5" fill="#e879f9"/><path d="M149 76 L176 65" stroke="#8290a5" strokeWidth="3"/></g>
      <g className="oracle-leg-left"><path d="M91 206 L108 209 99 268 84 269 78 239Z" fill="#1b2230" stroke="#070811" strokeWidth="4"/><Joint cx={91} cy={269} r={5} accent="#d946ef"/><path d="M84 272 L99 271 94 321 76 322 73 300Z" fill="#283142" stroke="#070811" strokeWidth="4"/><path d="M74 317 L95 317 99 329 67 330 63 325Z" fill="#0e121b"/></g>
      <g className="oracle-leg-right"><path d="M111 209 L129 203 144 261 131 270 114 242Z" fill="#222a39" stroke="#070811" strokeWidth="4"/><Joint cx={138} cy={266} r={5} accent="#d946ef"/><path d="M132 272 L147 265 159 315 142 322 132 298Z" fill="#30394a" stroke="#070811" strokeWidth="4"/><path d="M141 317 L159 312 174 325 169 332 139 330Z" fill="#0e121b"/></g>
      <g className="oracle-torso"><path d="M94 105 L127 101 144 130 132 199 114 215 91 204 77 143Z" fill="#101522" stroke="#070811" strokeWidth="5"/><path d="M91 111 L107 104 105 187 88 174 81 141Z" fill="#2e3548"/><path d="M111 104 L127 107 139 130 114 190Z" fill="#20283a"/><path d="M105 115 L116 111 122 189 112 205 102 185Z" fill="#090c15" stroke="#596579" strokeWidth="2"/><path d="M110 122 L116 121 117 178 112 186Z" fill="#d946ef"/><path d="M84 139 L101 132 M121 132 L137 126 M88 157 L101 151 M123 151 L135 145" stroke="#8e9aad" strokeWidth="2"/></g>
      <g className="oracle-arm-left"><Joint cx={82} cy={119} r={5} accent="#d946ef"/><path d="M79 119 L65 132 57 178 68 181 88 137Z" fill="#242c3b" stroke="#070811" strokeWidth="4"/><Joint cx={62} cy={180} r={5} accent="#d946ef"/><path d="M57 184 L69 180 63 228 50 235 46 219Z" fill="#1a2130" stroke="#070811" strokeWidth="4"/><path d="M50 231 L63 225 69 234 62 245 48 244 43 237Z" fill="#101520"/><path d="M47 239 l-8 9 M54 242 l-4 11 M61 240 l4 9" stroke="#929db0" strokeWidth="2"/></g>
      <g className="oracle-arm-right"><Joint cx={135} cy={119} r={5} accent="#d946ef"/><path d="M138 118 L151 130 166 174 155 180 132 138Z" fill="#293244" stroke="#070811" strokeWidth="4"/><Joint cx={160} cy={178} r={5} accent="#d946ef"/><path d="M157 183 L169 174 188 216 178 237 163 226 153 203Z" fill="#1c2433" stroke="#070811" strokeWidth="4"/><path d="M165 191 L176 186 191 213 181 220Z" fill="#343c50"/><path d="M174 217 L188 211 197 224 181 235 169 229Z" fill="#090d17" stroke="#d946ef" strokeWidth="2"/><path d="M180 217 L194 221" stroke="#f0abfc" strokeWidth="3"/></g>
      <g className="oracle-neck"><path d="M101 77 L122 77 126 106 116 112 101 104Z" fill="#0e1420" stroke="#070811" strokeWidth="4"/><path d="M102 84 L123 84 M103 92 L124 92 M103 100 L124 100" stroke="#778399" strokeWidth="3"/></g>
      <g className="oracle-head"><path d="M99 24 L124 17 138 37 130 78 116 88 96 76 89 40Z" fill="#1d2535" stroke="#070811" strokeWidth="5"/><path d="M102 26 L121 22 132 38 119 45 94 43Z" fill="#3a4355"/><path d="M96 46 L130 41 126 70 114 80 99 70Z" fill="#080b14"/><path d="M112 42 L119 41 118 73 112 75Z" fill="#e879f9"/><circle cx="103" cy="51" r="3" fill="#f5d0fe"/><circle cx="125" cy="55" r="2.5" fill="#c084fc"/><circle cx="103" cy="65" r="2" fill="#a855f7"/><circle cx="122" cy="69" r="1.5" fill="#f0abfc"/></g>
      <path className="oracle-surface-detail" d="M91 127 l10 -7 M124 119 l10 8 M95 177 l7 4 M120 179 l9 -7" stroke="#8995aa" strokeWidth="1.2" opacity=".65"/>
    </g>
  </svg>;
}

function Nexus({ name }: { name:string }) {
  return <svg className="fighter-svg fighter-art-nexus" viewBox="0 0 220 360" role="img" aria-label={name}>
    <ellipse className="fighter-ground-shadow" cx="112" cy="334" rx="70" ry="9"/>
    <g className="robot-body nexus-body">
      <g className="nexus-leg-left"><path d="M77 210 L108 213 104 266 81 274 68 244Z" fill="#263341" stroke="#05070c" strokeWidth="5"/><path d="M76 239 L101 242 97 259 74 255Z" fill="#445463"/><Joint cx={91} cy={271} r={7}/><path d="M78 276 L102 272 100 317 72 320 66 300Z" fill="#303e4b" stroke="#05070c" strokeWidth="5"/><path d="M72 312 L101 312 107 327 61 329 55 322Z" fill="#10161d"/><path d="M79 285 L97 282" stroke="#22d3ee" strokeWidth="2"/></g>
      <g className="nexus-leg-right"><path d="M111 213 L143 207 158 253 143 270 118 259Z" fill="#2f3c49" stroke="#05070c" strokeWidth="5"/><path d="M125 231 L150 226 155 244 132 251Z" fill="#4b5b68"/><Joint cx={149} cy={266} r={7} accent="#d946ef"/><path d="M137 274 L159 263 174 307 160 320 134 310 128 293Z" fill="#354451" stroke="#05070c" strokeWidth="5"/><path d="M136 307 L169 310 185 325 178 331 132 326Z" fill="#10161d"/><path d="M145 281 L162 277" stroke="#d946ef" strokeWidth="2"/></g>
      <g className="nexus-torso"><path d="M67 93 L151 92 174 121 163 194 143 218 80 215 55 190 48 124Z" fill="#111821" stroke="#05070c" strokeWidth="6"/><path d="M58 111 L96 97 101 148 61 145Z" fill="#40505d" stroke="#8495a1" strokeWidth="2"/><path d="M105 96 L145 101 164 122 116 149Z" fill="#32414e"/><path d="M62 152 L98 157 96 203 72 197 59 181Z" fill="#283641"/><path d="M116 155 L160 143 155 188 138 207 116 200Z" fill="#26323e"/>
        <g className="nexus-core"><path d="M89 111 L125 107 143 132 130 169 99 172 80 144Z" fill="#070b10" stroke="#718390" strokeWidth="4"/><path d="M96 119 L121 116 133 134 125 159 102 161 89 143Z" fill="none" stroke="#22d3ee" strokeWidth="5"/><path d="M102 125 L119 123 126 136 120 151 105 153 96 142Z" fill="none" stroke="#d946ef" strokeWidth="4"/><path d="M108 131 L118 130 121 139 116 147 107 145 103 138Z" fill="#fff7db"/></g>
        <path d="M54 166 L84 168 M137 178 L158 169" stroke="#22d3ee" strokeWidth="2"/><path d="M74 191 L94 193 M124 191 L148 183" stroke="#d946ef" strokeWidth="2"/>
      </g>
      <g className="nexus-arm-left"><path d="M54 96 L25 110 17 151 42 166 68 125Z" fill="#3c4b57" stroke="#05070c" strokeWidth="5"/><path d="M30 108 L55 101 60 118 34 128Z" fill="#61727e"/><Joint cx={39} cy={164} r={8}/><path d="M28 171 L49 161 60 207 47 229 23 220 17 193Z" fill="#293742" stroke="#05070c" strokeWidth="5"/><path d="M25 180 L49 170 53 188 24 198Z" fill="#42525e"/><path d="M26 209 L53 202 60 219 47 234 25 226Z" fill="#111820"/><path d="M29 216 L51 210" stroke="#22d3ee" strokeWidth="3"/></g>
      <g className="nexus-arm-right"><path d="M153 95 L183 108 203 142 184 164 150 126Z" fill="#354450" stroke="#05070c" strokeWidth="5"/><path d="M164 104 L184 111 198 130 176 135Z" fill="#52636f"/><Joint cx={185} cy={160} r={8} accent="#d946ef"/><path d="M178 168 L198 153 217 192 209 219 185 225 173 198Z" fill="#2c3945" stroke="#05070c" strokeWidth="5"/><path d="M183 172 L200 162 211 181 181 190Z" fill="#4a5b68"/><path d="M184 201 L214 190 218 212 208 229 184 222Z" fill="#111820"/><path d="M191 207 L212 200" stroke="#d946ef" strokeWidth="3"/><path d="M190 218 l-9 12 M199 220 l-3 14 M208 217 l5 12" stroke="#9aabb5" strokeWidth="3"/></g>
      <g className="nexus-neck"><path d="M91 76 L132 75 137 101 124 111 94 104Z" fill="#111820" stroke="#05070c" strokeWidth="5"/><circle cx="100" cy="88" r="5" fill="#344654"/><circle cx="128" cy="87" r="5" fill="#344654"/></g>
      <g className="nexus-head"><path d="M79 34 L137 27 155 48 146 82 127 98 91 91 69 69Z" fill="#202d38" stroke="#05070c" strokeWidth="5"/><path d="M83 35 L132 31 148 47 134 56 78 58 70 49Z" fill="#52636e"/><path d="M78 57 L145 50 140 75 126 88 91 83 72 69Z" fill="#080c12"/><path d="M88 59 L134 55 131 64 91 68Z" fill="#22d3ee"/><path d="M104 64 L116 62 115 72 105 73Z" fill="#fff7db"/><circle cx="82" cy="70" r="3" fill="#d946ef"/><circle cx="137" cy="68" r="3" fill="#d946ef"/><path d="M87 80 L130 75 124 90 94 87Z" fill="#2e3d48"/><path d="M83 31 L91 18 101 30 M128 28 L139 16 142 34" fill="#344654" stroke="#05070c" strokeWidth="3"/></g>
      <path className="nexus-surface-detail" d="M66 126 l18 -7 M137 116 l17 8 M74 188 l18 4 M129 190 l17 -8" stroke="#9babb6" strokeWidth="1.4" opacity=".7"/>
    </g>
  </svg>;
}

export function FighterArtwork({ side, opponentNumber, name }: FighterArtworkProps) {
  if (side === "player") return <PlayerArtwork name={name}/>;
  if (opponentNumber === 2) return <Bastion name={name}/>;
  if (opponentNumber === 3) return <Oracle name={name}/>;
  if (opponentNumber === 4) return <Nexus name={name}/>;
  return <Pulse name={name}/>;
}
