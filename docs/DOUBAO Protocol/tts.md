<span id="59c38493"></span>
# 语音合成大模型API列表
根据具体场景选择合适的语音合成大模型API。

| | | | | \
|**接口** |**推荐场景** |**接口功能** |**文档链接** |
|---|---|---|---|
| | | | | \
|`wss://openspeech.bytedance.com/api/v3/tts/bidirection ` |WebSocket协议，实时交互场景，支持文本实时流式输入，流式输出音频。 |语音合成、声音复刻、混音 |[V3 WebSocket双向流式文档](https://www.volcengine.com/docs/6561/1329505) |
| | | | | \
|`wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream` |WebSocket协议，一次性输入合成文本，流式输出音频。 |语音合成、声音复刻、混音 |[V3 WebSocket单向流式文档](https://www.volcengine.com/docs/6561/1719100) |
| | | | | \
|`https://openspeech.bytedance.com/api/v3/tts/unidirectional ` |HTTP Chunked协议，一次性输入全部合成文本，流式输出音频。 |语音合成、声音复刻、混音 |[V3 HTTP Chunked单向流式文档](https://www.volcengine.com/docs/6561/1598757?lang=zh#_2-http-chunked%E6%A0%BC%E5%BC%8F%E6%8E%A5%E5%8F%A3%E8%AF%B4%E6%98%8E) |
| | | | | \
|`https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse` |HTTP SSE协议，一次性输入全部合成文本，流式输出音频。 |语音合成、声音复刻、混音 |[V3 Server Sent Events（SSE）单向流式文档](https://www.volcengine.com/docs/6561/1598757?lang=zh#_3-sse%E6%A0%BC%E5%BC%8F%E6%8E%A5%E5%8F%A3%E8%AF%B4%E6%98%8E) |

<span id="76e95139"></span>
# 1 接口功能
双向流式API为用户提供文本转语音能力，支持多语种、多方言，支持WebSocket协议流式调用，同时支持一包发送请求数据或者边发边收数据的流式交互方式。
<span id="c049186b"></span>
## 1.1 最佳实践
该接口会处理碎片化的文本或者过长的文本，整理为长度合适的句子。因此最大的优势是平衡延迟和合成效果。
在对接大文本模型时，推荐将流式输出的文本直接输入该接口，而不要额外增加切句或者攒句的逻辑。同样的文本调用一次该接口与多次调用合成接口相比，前者会更为自然，情绪更饱满。
推荐使用链接复用的方式接入，在每次使用时只需要建立一次websocket连接，即发送startconnection，在收到ConnectionStarted后，即为链接建立成功。此时，发送startsession，通过taskrequest发送文本，同时接收音频。在没有文本可以发送时，需立即发送finish session。如果还有文本发送需要合成，此时无需断开链接，待收到SessionFinished后（必须），重新发送startsession，开启新一轮session。如果再没有文本需要合成，即可发送finish connection断开链接。具体流程可参考该页交互示例**。**
注意，同一个WebSocket链接下支持多次session，但不支持同时多个session。
<span id="6ece0a51"></span>
# 2 接口说明
<span id="52a4a33b"></span>
## 2.1 请求Request
<span id="60c0db04"></span>
### 请求路径

* 服务使用的请求路径：`wss://openspeech.bytedance.com/api/v3/tts/bidirection`

<span id="31dacc89"></span>
### 建连&鉴权
<span id="6d17af2c"></span>
#### 鉴权Request Headers
在 websocket 建连的 HTTP 请求头（Request Header 中）添加以下信息
使用[新版控制台](https://console.volcengine.com/speech/new)时，推荐采用以下更简化的鉴权方式。

| | | | | | \
|Key |说明 |参数类型 |是否必须 |Value示例 |
|---|---|---|---|---|
| | | | | | \
|X-Api-Key |使用火山引擎控制台获取的API Key，可参考 [控制台API Key管理](https://www.volcengine.com/docs/6561/2119699?lang=zh#ew1HctnP) |string |必须 |"your-api-key" |
| | | | | | \
|X-Api-Resource-Id |\
| |表示调用服务的资源信息 ID，可以用来选择不同的模型版本效果，也决定了计费方式。 |\
| | |string |必须 |**豆包语音合成大模型** |\
| | | | |语音合成接口通过 `X-Api-Resource-Id` 参数来选择不同的版本效果： |\
| | | | | |\
| | | | |* `seed-tts-2.0`仅支持调用["豆包语音合成模型2.0"的音色](https://www.volcengine.com/docs/6561/1257544?lang=zh#%E8%B1%86%E5%8C%85%E8%AF%AD%E9%9F%B3%E5%90%88%E6%88%90%E6%A8%A1%E5%9E%8B2-0-%E9%9F%B3%E8%89%B2%E5%88%97%E8%A1%A8) |\
| | | | |* `seed-tts-1.0` / `seed-tts-1.0-concurr`仅支持调用["豆包语音合成模型1.0"的音色](https://www.volcengine.com/docs/6561/1257544?lang=zh#%E8%B1%86%E5%8C%85%E8%AF%AD%E9%9F%B3%E5%90%88%E6%88%90%E6%A8%A1%E5%9E%8B1-0-%E9%9F%B3%E8%89%B2%E5%88%97%E8%A1%A8) |\
| | | | | |\
| | | | |同时，`X-Api-Resource-Id` 也决定了计费方式： |\
| | | | | |\
| | | | |* `seed-tts-2.0`：对应计费商品为 “语音合成2.0字符版“ |\
| | | | |* `seed-tts-1.0`：对应计费商品为“语音合成1.0字符版” |\
| | | | |* `seed-tts-1.0-concurr`：对应计费商品为“语音合成1.0并发版“ |\
| | | | | |\
| | | | |**豆包声音复刻大模型** |\
| | | | |语音合成接口通过 `X-Api-Resource-Id` 参数来选择不同的版本效果： |\
| | | | | |\
| | | | |* `seed-icl-2.0`：对应声音复刻2.0 版本效果 |\
| | | | |* `seed-icl-1.0` / `seed-icl-1.0-concurr`：对应声音复刻1.0 版本效果 |\
| | | | | |\
| | | | |同时，`X-Api-Resource-Id` 也决定了计费方式： |\
| | | | | |\
| | | | |* `seed-icl-2.0`：对应计费商品为“声音复刻2.0 字符版” |\
| | | | |* `seed-icl-1.0`：对应计费商品为“声音复刻1.0 字符版” |\
| | | | |* `seed-icl-1.0-concurr`：对应计费商品为“声音复刻1.0 并发版” |
| | | | | | \
|X-Api-Connect-Id |用于追踪当前连接情况的标志 ID |\
| |建议用户传递，便于排查连接情况 |\
| |该session id不可复用，每个session需保证ID是唯一的（请求失败重连的情况session id也需重新生成，不可复用上一次session的ID） |string |可选 |“67ee89ba-7050-4c04-a3d7-ac61a63499b3” |

```Python
headers = {
    "X-Api-Key": "your-api-key",
    "X-Api-Resource-Id": "seed-tts-2.0"
}
```

若使用[旧版控制台](https://console.volcengine.com/speech/app)，鉴权方式如下。建议尽快切换至新版，以体验更便捷的鉴权流程。

| | | | | | \
|Key |说明 |参数类型 |是否必须 |Value示例 |
|---|---|---|---|---|
| | | | | | \
|X-Api-App-Id |\
| |使用火山引擎控制台获取的APP ID，可参考 [控制台使用FAQ-Q1](https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F)（旧版控制台使用，新版控制台只需要X-Api-Key即可） |string |必须 |\
| | | | |“123456789” |\
| | | | | |
| | | | | | \
|X-Api-Access-Key |\
| |使用火山引擎控制台获取的Access Token，可参考 [控制台使用FAQ-Q1](https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F)（旧版控制台使用，新版控制台只需要X-Api-Key即可） |string |必须 |\
| | | | |“your-access-key” |\
| | | | | |
| | | | | | \
|X-Api-Resource-Id |\
| |表示调用服务的资源信息 ID，可以用来选择不同的模型版本效果，也决定了计费方式。 |\
| | |string |必须 |\
| | | | |**豆包语音合成大模型** |\
| | | | |语音合成接口通过 `X-Api-Resource-Id` 参数来选择不同的版本效果： |\
| | | | | |\
| | | | |* `seed-tts-2.0`仅支持调用["豆包语音合成模型2.0"的音色](https://www.volcengine.com/docs/6561/1257544?lang=zh#%E8%B1%86%E5%8C%85%E8%AF%AD%E9%9F%B3%E5%90%88%E6%88%90%E6%A8%A1%E5%9E%8B2-0-%E9%9F%B3%E8%89%B2%E5%88%97%E8%A1%A8) |\
| | | | |* `seed-tts-1.0` / `seed-tts-1.0-concurr`仅支持调用["豆包语音合成模型1.0"的音色](https://www.volcengine.com/docs/6561/1257544?lang=zh#%E8%B1%86%E5%8C%85%E8%AF%AD%E9%9F%B3%E5%90%88%E6%88%90%E6%A8%A1%E5%9E%8B1-0-%E9%9F%B3%E8%89%B2%E5%88%97%E8%A1%A8) |\
| | | | | |\
| | | | |同时，`X-Api-Resource-Id` 也决定了计费方式： |\
| | | | | |\
| | | | |* `seed-tts-2.0`：对应计费商品为 “语音合成2.0字符版“ |\
| | | | |* `seed-tts-1.0`：对应计费商品为“语音合成1.0字符版” |\
| | | | |* `seed-tts-1.0-concurr`：对应计费商品为“语音合成1.0并发版“ |\
| | | | | |\
| | | | |**豆包声音复刻大模型** |\
| | | | |语音合成接口通过 `X-Api-Resource-Id` 参数来选择不同的版本效果： |\
| | | | | |\
| | | | |* `seed-icl-2.0`：对应声音复刻2.0 版本效果 |\
| | | | |* `seed-icl-1.0` / `seed-icl-1.0-concurr`：对应声音复刻1.0 版本效果 |\
| | | | | |\
| | | | |同时，`X-Api-Resource-Id` 也决定了计费方式： |\
| | | | | |\
| | | | |* `seed-icl-2.0`：对应计费商品为“声音复刻2.0 字符版” |\
| | | | |* `seed-icl-1.0`：对应计费商品为“声音复刻1.0 字符版” |\
| | | | |* `seed-icl-1.0-concurr`：对应计费商品为“声音复刻1.0 并发版” |
| | | | | | \
|X-Api-Connect-Id |用于追踪当前连接情况的标志 ID |\
| |建议用户传递，便于排查连接情况 |\
| |该session id不可复用，每个session需保证ID是唯一的（请求失败重连的情况session id也需重新生成，不可复用上一次session的ID） |string |可选 |“67ee89ba-7050-4c04-a3d7-ac61a63499b3” |

```Python
headers = {
    "X-Api-App-Id": "123456789",
    "X-Api-Access-Key": "your-access-key",
    "X-Api-Resource-Id": "seed-tts-2.0"
}
```

<span id="63aabb7c"></span>
### 额外Request Headers

| | | | | \
|Key |说明 |是否必须 |Value示例 |
|---|---|---|---|
| | | | | \
|X-Control-Require-Usage-Tokens-Return |请求消耗的用量返回控制标记。当携带此字段，在SessionFinish事件（152）中会携带用量数据 |否 |* 设置为*，表示返回已支持的用量数据。 |\
| | | |* 也设置为具体的用量数据标记，如text_words；多个用逗号分隔 |\
| | | |* 当前已支持的用量数据 |\
| | | |   * text_words，表示计费字符数 |

<span id="549ba1e7"></span>
### Response Headers
在 websocket 握手成功后，会返回这些 Response header

| | | | \
|Key |说明 |Value 示例 |
|---|---|---|
| | | | \
|X-Tt-Logid |服务端返回的 logid，建议用户获取和打印方便定位问题 |202407261553070FACFE6D19421815D605 |

<span id="258d4879"></span>
### WebSocket 二进制协议
WebSocket 使用二进制协议传输数据。
协议的组成由至少 4 个字节的可变 header、payload size 和 payload 三部分组成，其中

* header 描述消息类型、序列化方式以及压缩格式等信息
* 可选字段
   * event 字段，用于描述连接过程中状态管理的预定义事件
   * connect id size/ connect id 字段，用于描述连接类事件的额外信息
   * session id size/ session id 字段，用于描述会话类事件的额外信息
   * error code: 仅用于错误帧，描述错误信息
* payload size 是 payload 的长度
* payload 是具体负载内容，依据消息类型不同 payload 内容不同。

需注意：协议中整数类型的字段都使用**大端**表示。
<span id="704e58c7"></span>
#### 二进制帧

| | | | | \
|Byte |Left 4-bit |Right 4-bit |说明 |
|---|---|---|---|
| | | | | \
|0 - Left half |Protocol version | |目前只有v1，始终填`0b0001` |
| | | | | \
|0 - Right half | |Header size (4x) |目前只有4字节，始终填`0b0001` |
| | | | | \
|1 |Message type |Message type specific flags |下文详细说明 |
| | | | | \
|2 - Left half |Serialization method | |* `0b0000`：Raw（无特殊序列化方式，主要针对二进制音频数据） |\
| | | |* `0b0001`：JSON（主要针对文本类型消息） |
| | | | | \
|2 - Right half | |Compression method |* `0b0000`：无压缩 |\
| | | |* `0b0001`：gzip |
| | || | \
|3 |Reserved | |留空（`0b0000 0000`） |
| | || | \
|[4 ~ 7] |[Optional field,like event number,...] | |取决于Message type specific flags，可能有、也可能没有 |
| | || | \
|... |Payload | |可能是音频数据、文本数据、音频文本混合数据 |

<span id="66e618bc"></span>
##### Message type & specific flags
Message type & specific flags是重点扩展的部分，详细说明如下：

| | | | | | \
|Message type |含义 |Message type specific flags |是否包含Event number |备注 |
|---|---|---|---|---|
| | | | | | \
|0b0001 |Full-client request |0b0100 |是 |完整请求体，用于触发服务端session初始化 |
| | | | | | \
|0b1001 |Full-server response  |0b0100 |是 |TTS：前端信息、文本音频混合数据等（Serialization=JSON） |
| | | | | | \
|0b1011 |Audio-only response  |0b0100 |是 | |
| | | | | | \
|0b1111 |Error information |None |否 | |

<span id="caed565b"></span>
##### Payload 请求参数
注意：TTS服务参数设置仅在StartSession时生效，每次发送的文本在TaskRequest时生效。
TTS服务参数具体如下：

| | | | | | \
|**字段** |**描述** |**是否必须** |**类型** |**默认值** |
|---|---|---|---|---|
| | | | | | \
|user |用户信息 | | | |
| | | | | | \
|user.uid |用户uid | | | |
| | | | | | \
|event |请求的事件 |√ | | |
| | | | | | \
|namespace |请求方法 | |string |BidirectionalTTS |
| | | | | | \
|req_params.text |required，输入文本（双向流式不支持ssml） |√ |string | |
| | | | | | \
|req_params.model |\
| |模型版本，传`seed-tts-1.1`较默认版本音质有提升，并且延时更优，不传为默认效果。 |\
| |注：若使用1.1模型效果，在复刻场景中会放大训练音频prompt特质，因此对prompt的要求更高，使用高质量的训练音频，可以获得更优的音质效果。 |\
| | |\
| |以下参数仅针对声音复刻2.0的音色生效，即音色ID的前缀为`saturn_`的音色。音色的取值为以下两种： |\
| | |\
| |* `seed-tts-2.0-expressive`：表现力较强，支持QA和Cot能力，不过可能存在抽卡的情况。 |\
| |* `seed-tts-2.0-standard`：表现力上更加稳定，但是不支持QA和Cot能力。如果此时使用QA或Cot能力，则拒绝请求。 |\
| |* 如果不传model参数，默认使用`seed-tts-2.0-expressive`模型。 | |string |\
| | | | | |
| | | | | | \
|req_params.speaker |发音人，具体见[发音人列表](https://www.volcengine.com/docs/6561/1257544) |√ |string | |
| | | | | | \
|req_params.audio_params |音频参数，便于服务节省音频解码耗时 |√ |object | |
| | | | | | \
|req_params.audio_params.format |音频编码格式，mp3/ogg_opus/pcm。<span style="background-color: rgba(255,246,122, 0.8)">接口传入wav并不会报错，在流式场景下传入wav会多次返回wav header，这种场景建议使用pcm。</span> | |string |mp3 |
| | | | | | \
|req_params.audio_params.sample_rate |音频采样率，可选值 [8000,16000,22050,24000,32000,44100,48000] | |number |24000 |
| | | | | | \
|req_params.audio_params.bit_rate |音频比特率，可传16000、32000等。 |\
| |bit_rate默认设置范围为64k～160k，传了disable_default_bit_rate为true后可以设置到64k以下 |\
| |GoLang示例：`additions = fmt.Sprintf("{\"disable_default_bit_rate\":true}")` |\
| |**注：​**针对MP3和ogg格式建议主动设置bit_rate，若使用默认值(实际被设置为8k)会出现音质损耗比较严重的情况；wav计算比特率跟pcm一样是 比特率 (bps) = 采样率 × 位深度 × 声道数； |\
| |目前大模型TTS只能改采样率，所以对于wav格式来说只能通过改采样率来变更音频的比特率； | |number | |
| | | | | | \
|req_params.audio_params.emotion |设置音色的情感。示例："emotion": "angry" |\
| |注：当前仅部分音色支持设置情感，且不同音色支持的情感范围存在不同。 |\
| |详见：[大模型语音合成API-音色列表-多情感音色](https://www.volcengine.com/docs/6561/1257544) | |string | |
| | | | | | \
|req_params.audio_params.emotion_scale |调用emotion设置情感参数后可使用emotion_scale进一步设置情绪值，范围1~5，不设置时默认值为4。 |\
| |注：理论上情绪值越大，情感越明显。但情绪值1~5实际为非线性增长，可能存在超过某个值后，情绪增加不明显，例如设置3和5时情绪值可能接近。 | |number |4 |
| | | | | | \
|req_params.audio_params.speech_rate |语速，取值范围[-50,100]，100代表2.0倍速，-50代表0.5倍数 | |number |0 |
| | | | | | \
|req_params.audio_params.loudness_rate |音量，取值范围[-50,100]，100代表2.0倍音量，-50代表0.5倍音量（mix音色暂不支持） | |number |0 |
| | | | | | \
|req_params.audio_params.enable_timestamp |设置 "enable_timestamp": true 返回句级别字的时间戳（默认为 false，参数传入 true 即表示启用） |\
| |开启后，在原有返回的事件`event=TTSSentenceEnd`中，新增该子句的时间戳信息。 |\
| | |\
| |* 一个子句的时间戳返回之后才会开始返回下一句音频。 |\
| |* 合成有多个子句会多次返回`TTSSentenceStart`和`TTSSentenceEnd`。开启字幕后字幕跟随`TTSSentenceEnd`返回。 |\
| |* 字/词粒度的时间戳，其中字/词是tn。具体可以看下面的例子。 |\
| |* 支持中、英，其他语种、方言暂时不支持。 |\
| | |\
| |注：该参数只在TTS1.0(["豆包语音合成模型1.0"的音色](https://www.volcengine.com/docs/6561/1257544))、ICL1.0生效。 | |bool |false |
| | | | | | \
|req_params.audio_params.enable_subtitle |设置 "enable_subtitle": true 返回句级别字的时间戳（默认为 false，参数传入 true 即表示启用） |\
| |开启后，新增返回事件`event=TTSSubtitle`，包含字幕信息。 |\
| | |\
| |* 在一句音频合成之后，不会立即返回该句的字幕。合成进度不会被字幕识别阻塞，当一句的字幕识别完成后立即返回。可能一个子句的字幕返回的时候，已经返回下一句的音频帧给调用方了。 |\
| |* 合成有多个子句，仅返回一次`TTSSentenceStart`和`TTSSentenceEnd`。开启字幕后会多次返回`TTSSubtitle`。 |\
| |* 字/词粒度的时间戳，其中字/词是原文。具体可以看下面的例子。 |\
| |* 支持中、英，其他语种、方言暂时不支持； |\
| |* latex公式不支持 |\
| |   * req_params.additions.enable_latex_tn为true时，不开启字幕识别功能，即不返回字幕； |\
| |* ssml不支持 |\
| |   * req_params.ssml 不传时，不开启字幕识别功能，即不返回字幕； |\
| | |\
| |注：该参数只在TTS2.0、ICL2.0生效。 | |bool |false |
| | | | | | \
|req_params.additions |用户自定义参数 | |jsonstring | |
| | | | | | \
|req_params.additions.silence_duration |设置该参数可在句尾增加静音时长，范围0~30000ms。（注：增加的句尾静音主要针对传入文本最后的句尾，而非每句话的句尾） | |number |0 |
| | | | | | \
|req_params.additions.enable_language_detector |自动识别语种 | |bool |false |
| | | | | | \
|req_params.additions.disable_markdown_filter |是否开启markdown解析过滤， |\
| |为true时，解析并过滤markdown语法，例如，`**你好**`，会读为“你好”， |\
| |为false时，不解析不过滤，例如，`**你好**`，会读为“星星‘你好’星星” | |bool |false |
| | | | | | \
|req_params.additions.disable_emoji_filter |开启emoji表情在文本中不过滤显示，默认为false，建议搭配时间戳参数一起使用。 |\
| |GoLang示例：`additions = fmt.Sprintf("{"disable_emoji_filter":true}")` | |bool |false |
| | | | | | \
|req_params.additions.mute_cut_remain_ms |该参数需配合mute_cut_threshold参数一起使用，其中： |\
| |"mute_cut_threshold": "400",   // 静音判断的阈值（音量小于该值时判定为静音） |\
| |"mute_cut_remain_ms": "50", // 需要保留的静音长度 |\
| |注：参数和value都为string格式 |\
| |Golang示例：`additions = fmt.Sprintf("{"mute_cut_threshold":"400", "mute_cut_remain_ms": "1"}")` |\
| |特别提醒： |\
| | |\
| |* 因MP3格式的特殊性，句首始终会存在100ms内的静音无法消除，WAV格式的音频句首静音可全部消除，建议依照自身业务需求综合判断选择 |\
| |* ["豆包语音合成模型2.0"的音色](https://www.volcengine.com/docs/6561/1257544) 暂不支持 |\
| |* 豆包声音复刻模型2.0（icl 2.0）的音色暂不支持 | |string | |
| | | | | | \
|req_params.additions.enable_latex_tn |是否可以播报latex公式，需将disable_markdown_filter设为true | |bool |false |
| | | | | | \
|req_params.additions.latex_parser |是否使用lid 能力播报latex公式，相较于latex_tn 效果更好； |\
| |值为“v2”时支持lid能力解析公式，值为“”时不支持lid； |\
| |需同时将disable_markdown_filter设为true； | |string | |
| | | | | | \
|req_params.additions.max_length_to_filter_parenthesis |是否过滤括号内的部分，0为不过滤，100为过滤 | |int |100 |
| | | | | | \
|req_params.additions.explicit_language（明确语种） |仅读指定语种的文本 |\
| |**精品音色和 声音复刻ICL 1.0场景：** |\
| | |\
| |* 不给定参数，正常中英混 |\
| |* `crosslingual` 启用多语种前端（包含`zh/en/ja/es-mx/id/pt-br`） |\
| |* `zh-cn` 中文为主，支持中英混  |\
| |* `en` 仅英文 |\
| |* `ja` 仅日文 |\
| |* `es-mx` 仅墨西 |\
| |* `id` 仅印尼 |\
| |* `pt-br` 仅巴葡 |\
| | |\
| |**DIT 声音复刻场景：** |\
| |当音色是使用model_type=2训练的，即采用dit标准版效果时，建议指定明确语种，目前支持：  |\
| | |\
| |* 不给定参数，启用多语种前端`zh,en,ja,es-mx,id,pt-br,de,fr` |\
| |* `zh,en,ja,es-mx,id,pt-br,de,fr` 启用多语种前端 |\
| |* `zh-cn` 中文为主，支持中英混  |\
| |* `en` 仅英文 |\
| |* `ja` 仅日文  |\
| |* `es-mx` 仅墨西  |\
| |* `id` 仅印尼  |\
| |* `pt-br` 仅巴葡  |\
| |* `de` 仅德语 |\
| |* `fr` 仅法语 |\
| | |\
| |当音色是使用model_type=3训练的，即采用dit还原版效果时，必须指定明确语种，目前支持：  |\
| | |\
| |* 不给定参数，正常中英混 |\
| |* `zh-cn` 中文为主，支持中英混  |\
| |* `en` 仅英文 |\
| | |\
| |**声音复刻 ICL2.0场景：** |\
| |当音色是使用model_type=4训练的 |\
| | |\
| |* 不给定参数，正常中英混 |\
| |* `zh-cn` 中文为主，支持中英混  |\
| |* `en` 仅英文 |\
| | |\
| |GoLang示例：`additions = fmt.Sprintf("{\"explicit_language\": \"zh\"}")` | |string | |
| | | | | | \
|req_params.additions.context_language（参考语种） |给模型提供参考的语种 |\
| | |\
| |* 不给定 西欧语种采用英语 |\
| |* id 西欧语种采用印尼 |\
| |* es 西欧语种采用墨西 |\
| |* pt 西欧语种采用巴葡 | |string | |
| | | | | | \
|req_params.additions.explicit_dialect |\
|（明确方言） |\
| |明确方言，目前仅`zh_female_vv_uranus_bigtts`音色支持以下三种方言： |\
| | |\
| |* dongbei（东北话） |\
| |* shaanxi（陕西话） |\
| |* sichuan（四川话） |\
| | |\
| |参数情况举例说明： |\
| | |\
| |1. speaker_id = `zh_female_xiaohe_uranus_bigtts`，explicit_language不传，explicit_dialect=dongbei，则报参数错误，即语种和方言不对应 |\
| |2. speaker_id =`zh_female_vv_uranus_bigtts`，explicit_language不传，explicit_dialect=dongbei，则正常完成东北方言的合成 |\
| |3. speaker_id = `zh_female_vv_uranus_bigtts`，explicit_language=ja，explicit_dialect=dongbei，则报参数错误，即语种和方言不对应 |\
| |4. speaker_id = `zh_female_vv_uranus_bigtts`，explicit_language=ja，explicit_dialect不传，则按照语种正常合成 | |string | |
| | | | | | \
|req_params.additions.unsupported_char_ratio_thresh |默认: 0.3，最大值: 1.0 |\
| |检测出不支持合成的文本超过设置的比例，则会返回错误。 | |float |0.3 |
| | | | | | \
|req_params.additions.aigc_watermark |默认：false |\
| |是否在合成结尾增加音频节奏标识 | |bool |false |
| | | | | | \
|req_params.additions.aigc_metadata （meta 水印） |在合成音频 header加入元数据隐式表示，支持 mp3/wav/ogg_opus | |object | |
| | | | | | \
|req_params.additions.aigc_metadata.enable |是否启用隐式水印 | |bool |false |
| | | | | | \
|req_params.additions.aigc_metadata.content_producer |合成服务提供者的名称或编码 | |string |"" |
| | | | | | \
|req_params.additions.aigc_metadata.produce_id |内容制作编号 | |string |"" |
| | | | | | \
|req_params.additions.aigc_metadata.content_propagator |内容传播服务提供者的名称或编码 | |string |"" |
| | | | | | \
|req_params.additions.aigc_metadata.propagate_id |内容传播编号 | |string |"" |
| | | | | | \
|req_params.additions.cache_config（缓存相关参数） |开启缓存，开启后合成**相同文本**时，服务会直接读取缓存返回上一次合成该文本的音频，可明显加快相同文本的合成速率，缓存数据保留时间1小时。 |\
| |（通过缓存返回的数据不会附带时间戳） |\
| |Golang示例：`additions = fmt.Sprintf("{\"disable_default_bit_rate\":true, \"cache_config\": {\"text_type\": 1,\"use_cache\": true}}")` | |object | |
| | | | | | \
|req_params.additions.cache_config.text_type（缓存相关参数） |和use_cache参数一起使用，需要开启缓存时传1 | |int |1 |
| | | | | | \
|req_params.additions.cache_config.use_cache（缓存相关参数） |和text_type参数一起使用，需要开启缓存时传true | |bool |true |
| | | | | | \
|req_params.additions.cache_config.use_segment_cache（缓存相关参数） |和text_type参数一起使用，需要开启缓存时传true |\
| |分句文本的缓存，双向流式场景首包耗时比使用use_cache 低。 | |bool |true |
| | | | | | \
|req_params.additions.post_process |后处理配置 |\
| |Golang示例：`additions = fmt.Sprintf("{"post_process":{"pitch":12}}")` | |object | |
| | | | | | \
|req_params.additions.post_process.pitch |音调取值范围是[-12,12] | |int |0 |
| | | | | | \
|req_params.additions.context_texts |\
|([仅TTS2.0支持](https://www.volcengine.com/docs/6561/1257544)) |语音合成的辅助信息，用于模型对话式合成，能更好的体现语音情感； |\
| |可以探索，比如常见示例有以下几种： |\
| | |\
| |1. 语速调整 |\
| |   1. 比如：context_texts: ["你可以说慢一点吗？"] |\
| |2. 情绪/语气调整 |\
| |   1. 比如：context_texts=["你可以用特别特别痛心的语气说话吗?"] |\
| |   2. 比如：context_texts=["嗯，你的语气再欢乐一点"] |\
| |3. 音量调整 |\
| |   1. 比如：context_texts=["你嗓门再小点。"] |\
| |4. 音感调整 |\
| |   1. 比如：context_texts=["你能用骄傲的语气来说话吗？"] |\
| | |\
| |注意： |\
| | |\
| |1. 该字段仅适用于["豆包语音合成模型2.0"的音色](https://www.volcengine.com/docs/6561/1257544) |\
| |2. 当前字符串列表只第一个值有效 |\
| |3. 该字段文本不参与计费 | |string list |null |
| | | | | | \
|req_params.additions.section_id |\
|([仅TTS2.0支持](https://www.volcengine.com/docs/6561/1257544)) |其他合成语音的会话id(session_id)，用于辅助当前语音合成，提供更多的上下文信息； |\
| |取值，参见接口交互中的session_id |\
| |示例： |\
| | |\
| |1. section_id="bf5b5771-31cd-4f7a-b30c-f4ddcbf2f9da" |\
| | |\
| |注意： |\
| | |\
| |1. 该字段仅适用于["豆包语音合成模型2.0"的音色](https://www.volcengine.com/docs/6561/1257544) |\
| |2. 历史上下文的session_id 有效期： |\
| |   1. 最长30轮 |\
| |   2. 最长10分钟 | |string |"" |
| | | | | | \
|req_params.additions.use_tag_parser |是否开启cot解析能力。cot能力可以辅助当前语音合成，对语速、情感等进行调整。 |\
| |注意： |\
| | |\
| |1. 音色支持范围：仅限声音复刻2.0复刻的音色 |\
| |2. 文本长度：单句的text字符长度最好小于64（cot标签也计算在内） |\
| |3. cot能力生效的范围是单句 |\
| | |\
| |示例： |\
| |支持单组和多组cot标签：`<cot text=急促难耐>工作占据了生活的绝大部分</cot>，只有去做自己认为伟大的工作，才能获得满足感。<cot text=语速缓慢>不管生活再苦再累，都绝不放弃寻找</cot>。` | |bool |false |
| | | | | | \
|[]req_params.mix_speaker |混音参数结构 |\
| |注意： |\
| | |\
| |1. 该字段仅适用于["豆包语音合成模型1.0"的音色](https://www.volcengine.com/docs/6561/1257544) | |object | |
| | | | | | \
|req_params.mix_speaker.speakers |混音音色名以及影响因子列表 |\
| |注意： |\
| | |\
| |1. 最多支持3个音色混音 |\
| |2. 音色风格差异较大的两个音色（如男女混），以0.5-0.5同等比例混合时，可能出现偶发跳变，建议尽量避免 |\
| |3. 使用Mix能力时，req_params.speaker = custom_mix_bigtts | |list |null |
| | | | | | \
|req_params.mix_speaker.speakers[i].source_speaker |混音源音色名 |\
| |注意： |\
| | |\
| |1. 支持["豆包语音合成模型1.0"的音色](https://www.volcengine.com/docs/6561/1257544)、["语音合成（小模型）"的音色](https://www.volcengine.com/docs/6561/97465?lang=zh)、声音复刻大模型的音色 |\
| |2. 使用声音复刻大模型音色时，使用`S_`开头的`speakerid`，或者使用查询接口获取的`icl_`的`speakerid`，不支持`DiT_`或者 `saturn_`开头的`speakerid` | |string |"" |
| | | | | | \
|req_params.mix_speaker.speakers[i].mix_factor |混音源音色名影响因子 |\
| |注意： |\
| | |\
| |1. 混音影响因子和必须=1 | |float |0 |

单音色请求参数示例：
```JSON
{
    "user": {
        "uid": "12345"
    },
    "event": 100,
    "req_params": {
        "text": "明朝开国皇帝朱元璋也称这本书为,万物之根",
        "speaker": "zh_female_shuangkuaisisi_moon_bigtts",
        "audio_params": {
            "format": "mp3",
            "sample_rate": 24000
        },
      }
    }
}
```

mix请求参数示例：
```JSON
{
    "user": {
        "uid": "12345"
    },
    "req_params": {
        "text": "明朝开国皇帝朱元璋也称这本书为万物之根",
        "speaker": "custom_mix_bigtts",
        "audio_params": {
            "format": "mp3",
            "sample_rate": 24000
        },
        "mix_speaker": {
            "speakers": [{
                "source_speaker": "zh_male_bvlazysheep",
                "mix_factor": 0.3
            }, {
                "source_speaker": "BV120_streaming",
                "mix_factor": 0.3
            }, {
                "source_speaker": "zh_male_ahu_conversation_wvae_bigtts",
                "mix_factor": 0.4
            }]
        }
    }
}
```

<span id="0bb658bf"></span>
## 2.2 响应Response
<span id="5449f6b2"></span>
### 建连响应
主要关注建连阶段 HTTP Response 的状态码和 Body

* 建连成功：状态码为 200
* 建连失败：状态码不为 200，Body 中提供错误原因说明

<span id="23656c27"></span>
### WebSocket 传输响应
<span id="8d851a5a"></span>
#### 文本帧

* 主要通过文本内容反馈异常错误信息

<span id="c648fe4f"></span>
#### 二进制帧

* 主要通过协议约定的方式，结构化返回正常响应和一般错误信息

<span id="b94b6a71"></span>
##### 正常响应帧

| | | | | \
|Byte |Left 4-bit |Right 4-bit |说明 |
|---|---|---|---|
| | | | | \
|0 - Left half |Protocol version | |目前只有v1，始终填`0b0001` |
| | | | | \
|0 - Right half | |Header size (4x) |目前只有4字节，始终填`0b0001` |
| | | | | \
|1 |Message type |Message type specific flags |下文详细说明 |
| | | | | \
|2 - Left half |Serialization method | |* `0b0000`：Raw（无特殊序列化方式，主要针对二进制音频数据） |\
| | | |* `0b0001`：JSON（主要针对文本类型消息） |
| | | | | \
|2 - Right half | |Compression method |* `0b0000`：无压缩 |\
| | | |* `0b0001`：gzip |
| | || | \
|3 |Reserved | |留空（`0b0000 0000`） |
| | || | \
|[4 ~ 7] |[Optional field,like event number,...] | |取决于Message type specific flags，可能有、也可能没有 |
| | || | \
|... |Payload | |可能是音频数据、文本数据、音频文本混合数据 |

<span id="05a006aa"></span>
###### Payload 响应参数

| | | | | \
|字段 |描述 |类型 |默认值 |
|---|---|---|---|
| | | | | \
|data |返回的二进制数据包 |[]byte | |
| | | | | \
|event |返回的事件类型 |number | |
| | | | | \
|res_params.text |经文本分句后的句子 |string |- |

<span id="ae8d2f3f"></span>
##### 错误响应帧

| | | | | \
|Byte |Left 4-bit |Right 4-bit |说明 |
|---|---|---|---|
| | | | | \
|0 - Left half |Protocol version | |目前只有v1，始终填`0b0001` |
| | | | | \
|0 - Right half | |Header size (4x) |目前只有4字节，始终填`0b0001` |
| | | | | \
|1 |Message type |Message type specific flags |固定为 `0b11110000` |
| | | | | \
|2 - Left half |Serialization method | |* `0b0001`：JSON（主要针对文本类型消息） |
| | | | | \
|2 - Right half | |Compression method |* `0b0000`：无压缩 |
| | || | \
|3 |Reserved | |留空（`0b0000 0000`） |
| | || | \
|[4 ~ 7] |Error code | |错误码 |
| | || | \
|... |Payload | |错误消息对象 |

<span id="951c6910"></span>
## 2.3 Event 定义
在 TTS 场景中，Event 是正常数据帧（包括上行和下行）的必要字段，事件定义了请求过程中必要的状态转移。具体的使用过程详见交互示例部分

| | | | | \
|Event code |含义 |事件类型 |应用阶段：上行/下行 |
|---|---|---|---|
| | | | | \
|1 |StartConnection，Websocket 阶段申明创建连接 |\
| |（在 HTTP 建连 Upgrade 后） |Connect 类 |上行 |
| | | | | \
|2 |FinishConnection，结束连接 |Connect 类 |上行 |
| | | | | \
|50 |ConnectionStarted，成功建连 |Connect 类 |下行 |
| | | | | \
|51 |ConnectionFailed，建连失败 |Connect 类 |下行 |
| | | | | \
|52 |ConnectionFinished 结束连接成功 |Connect 类 |下行 |
| | | | | \
|100 |StartSession，Websocket 阶段申明创建会话 |Connect 类 |上行 |
| | | | | \
|101 |CancelSession，取消会话（上行） |Session 类 |上行 |
| | | | | \
|102 |FinishSession，声明结束会话（上行） |Session 类 |上行 |
| | | | | \
|150 |SessionStarted，成功开始会话 |Session 类 |下行 |
| | | | | \
|151 |SessionCanceled，已取消会话 |Session 类 |下行 |
| | | | | \
|152 |SessionFinished，会话已结束（上行&下行） |Session 类 |下行 |
| | | | | \
|153 |SessionFailed，会话失败 |Session 类 |下行 |
| | | | | \
|200 |TaskRequest，传输请求内容 |数据类 |上行 |
| | | | | \
|350 |TTSSentenceStart，TTS 返回句内容开始 |数据类 |下行 |
| | | | | \
|351 |TTSSentenceEnd，TTS 返回句内容结束 |数据类 |下行 |
| | | | | \
|352 |TTSResponse，TTS 返回句的音频内容 |数据类 |下行 |

<span id="edd6b09b"></span>
## 2.4 时间戳句子格式说明

| | | | \
| |**TTS1.0** |\
| |**ICL1.0** |**TTS2.0** |\
| | |**ICL2.0** |
|---|---|---|
| | | | \
|事件交互区别 |合成有多个子句会多次返回`TTSSentenceStart`和`TTSSentenceEnd`。开启字幕后字幕跟随`TTSSentenceEnd`返回。 |合成有多个子句，仅返回一次`TTSSentenceStart`和`TTSSentenceEnd`。 |\
| | |开启字幕后会多次返回`TTSSubtitle`。 |
| | | | \
|返回时机 |一个子句的时间戳返回之后才会开始返回下一句音频。 |\
| | |在一句音频合成之后，不会立即返回该句的字幕。 |\
| | |合成进度不会被字幕识别阻塞，当一句的字幕识别完成后立即返回。 |\
| | |可能一个子句的字幕返回的时候，已经返回下一句的音频帧给调用方了。 |
| | | | \
|句子返回格式 |\
| |字幕信息是基于tn打轴 |\
| |:::tip |\
| |1. text字段对应于：原文 |\
| |2. words内文本字段对应于：tn |\
| |::: |\
| |第一句： |\
| |```JSON |\
| |{ |\
| |    "phonemes": [ |\
| |    ], |\
| |    "text": "2019年1月8日，软件2.0版本于格萨拉彝族乡应时而生。发布会当日，一场瑞雪将天地映衬得纯净无瑕。", |\
| |    "words": [ |\
| |        { |\
| |            "confidence": 0.8766515, |\
| |            "endTime": 0.295, |\
| |            "startTime": 0.155, |\
| |            "word": "二" |\
| |        }, |\
| |        { |\
| |            "confidence": 0.95224416, |\
| |            "endTime": 0.425, |\
| |            "startTime": 0.295, |\
| |            "word": "零" |\
| |        }, |\
| |        { |\
| |            "confidence": 0.9108828, |\
| |            "endTime": 0.575, |\
| |            "startTime": 0.425, |\
| |            "word": "一" |\
| |        }, |\
| |        { |\
| |            "confidence": 0.9609025, |\
| |            "endTime": 0.755, |\
| |            "startTime": 0.575, |\
| |            "word": "九" |\
| |        }, |\
| |        { |\
| |            "confidence": 0.96244556, |\
| |            "endTime": 1.005, |\
| |            "startTime": 0.755, |\
| |            "word": "年" |\
| |        }, |\
| |        { |\
| |            "confidence": 0.85796577, |\
| |            "endTime": 1.155, |\
| |            "startTime": 1.005, |\
| |            "word": "一" |\
| |        }, |\
| |        { |\
| |            "confidence": 0.8460129, |\
| |            "endTime": 1.275, |\
| |            "startTime": 1.155, |\
| |            "word": "月" |\
| |        }, |\
| |        { |\
| |            "confidence": 0.90833753, |\
| |            "endTime": 1.505, |\
| |            "startTime": 1.275, |\
| |            "word": "八" |\
| |        }, |\
| |        { |\
| |            "confidence": 0.9403977, |\
| |            "endTime": 1.935, |\
| |            "startTime": 1.505, |\
| |            "word": "日，" |\
| |        }, |\
| |         |\
| |        ... |\
| |         |\
| |        { |\
| |            "confidence": 0.9415791, |\
| |            "endTime": 10.505, |\
| |            "startTime": 10.355, |\
| |            "word": "无" |\
| |        }, |\
| |        { |\
| |            "confidence": 0.903162, |\
| |            "endTime": 10.895, // 第一句结束时间 |\
| |            "startTime": 10.505, |\
| |            "word": "瑕。" |\
| |        } |\
| |    ] |\
| |} |\
| |``` |\
| | |\
| |第二句： |\
| |```JSON |\
| |{ |\
| |    "phonemes": [ |\
| | |\
| |    ], |\
| |    "text": "这仿佛一则自然寓言：我们致力于在不断的版本迭代中，为您带来如雪后初霁般清晰、焕然一新的体验。", |\
| |    "words": [ |\
| |        { |\
| |            "confidence": 0.8970245, |\
| |            "endTime": 11.6953745, |\
| |            "startTime": 11.535375, // 第二句开始时间，是相对整个session的位置 |\
| |            "word": "这" |\
| |        }, |\
| |        { |\
| |            "confidence": 0.86508185, |\
| |            "endTime": 11.875375, |\
| |            "startTime": 11.6953745, |\
| |            "word": "仿" |\
| |        }, |\
| |        { |\
| |            "confidence": 0.73354065, |\
| |            "endTime": 12.095375, |\
| |            "startTime": 11.875375, |\
| |            "word": "佛" |\
| |        }, |\
| |        { |\
| |            "confidence": 0.8525295, |\
| |            "endTime": 12.275374, |\
| |            "startTime": 12.095375, |\
| |            "word": "一" |\
| |        }... |\
| |    ] |\
| |} |\
| |``` |\
| | |字幕信息是基于原文打轴 |\
| | |:::tip |\
| | |1. text字段对应于：原文 |\
| | |2. words内文本字段对应于：原文 |\
| | |::: |\
| | |第一句： |\
| | |```JSON |\
| | |{ |\
| | |    "phonemes": [ |\
| | |    ], |\
| | |    "text": "2019年1月8日，软件2.0版本于格萨拉彝族乡应时而生。", |\
| | |    "words": [ |\
| | |        { |\
| | |            "confidence": 0.11120544, |\
| | |            "endTime": 0.615, |\
| | |            "startTime": 0.585, |\
| | |            "word": "2019" |\
| | |        }, |\
| | |        { |\
| | |            "confidence": 0.8413397, |\
| | |            "endTime": 0.845, |\
| | |            "startTime": 0.615, |\
| | |            "word": "年" |\
| | |        }, |\
| | |        { |\
| | |            "confidence": 0.2413961, |\
| | |            "endTime": 0.875, |\
| | |            "startTime": 0.845, |\
| | |            "word": "1" |\
| | |        }, |\
| | |        { |\
| | |            "confidence": 0.8487973, |\
| | |            "endTime": 1.055, |\
| | |            "startTime": 0.875, |\
| | |            "word": "月" |\
| | |        }, |\
| | |        { |\
| | |            "confidence": 0.509697, |\
| | |            "endTime": 1.225, |\
| | |            "startTime": 1.165, |\
| | |            "word": "8" |\
| | |        }, |\
| | |        { |\
| | |            "confidence": 0.9516253, |\
| | |            "endTime": 1.485, |\
| | |            "startTime": 1.225, |\
| | |            "word": "日，" |\
| | |        }, |\
| | |         |\
| | |        ... |\
| | |         |\
| | |        { |\
| | |            "confidence": 0.6933777, |\
| | |            "endTime": 5.435, |\
| | |            "startTime": 5.325, |\
| | |            "word": "而" |\
| | |        }, |\
| | |        { |\
| | |            "confidence": 0.921702, |\
| | |            "endTime": 5.695, // 第一句结束时间 |\
| | |            "startTime": 5.435, |\
| | |            "word": "生。" |\
| | |        } |\
| | |    ] |\
| | |} |\
| | |``` |\
| | | |\
| | | |\
| | |第二句： |\
| | |```JSON |\
| | |{ |\
| | |    "phonemes": [ |\
| | | |\
| | |    ], |\
| | |    "text": "发布会当日，一场瑞雪将天地映衬得纯净无瑕。", |\
| | |    "words": [ |\
| | |        { |\
| | |            "confidence": 0.7016578, |\
| | |            "endTime": 6.3550415, |\
| | |            "startTime": 6.2150416, // 第二句开始时间，是相对整个session的位置 |\
| | |            "word": "发" |\
| | |        }, |\
| | |        { |\
| | |            "confidence": 0.6800497, |\
| | |            "endTime": 6.4450417, |\
| | |            "startTime": 6.3550415, |\
| | |            "word": "布" |\
| | |        }, |\
| | |         |\
| | |        ... |\
| | |         |\
| | |        { |\
| | |            "confidence": 0.8818264, |\
| | |            "endTime": 10.145041, |\
| | |            "startTime": 9.945042, |\
| | |            "word": "净" |\
| | |        }, |\
| | |        { |\
| | |            "confidence": 0.87248623, |\
| | |            "endTime": 10.285042, |\
| | |            "startTime": 10.145041, |\
| | |            "word": "无" |\
| | |        }, |\
| | |        { |\
| | |            "confidence": 0.8069703, |\
| | |            "endTime": 10.505041, |\
| | |            "startTime": 10.285042, |\
| | |            "word": "瑕。" |\
| | |        } |\
| | |    ] |\
| | |} |\
| | |``` |\
| | | |\
| | | |
| | | | \
|语种 |中、英，不支持小语种、方言 |中、英，不支持小语种、方言 |
| | | | \
|latex |enable_latex_tn=true，有字幕返回 |enable_latex_tn=true，无字幕返回，接口不报错 |
| | | | \
|ssml |req_params.ssml不为空，有字幕返回 |req_params.ssml不为空，无字幕返回，接口不报错 |

<span id="38507004"></span>
# 交互示例
<span id="d5171aef"></span>
## TTS1.0、ICL1.0交互
![Image](https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/55ef2efccd7c4baa8a2b8ba77dd0f444~tplv-goo7wpa0wc-image.image =3632x)
<span id="e2a898ef"></span>
## TTS2.0、ICL2.0交互
注：连接建立和断开的部分相同，下图省略。
![Image](https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/5efffc9217ec4c5889e4bce2a3ffcc7f~tplv-goo7wpa0wc-image.image =1564x)

`CancelSession`注意事项：

1. `CancelSession`支持客户端主动放弃当前session，结束合成，并且释放服务端资源。
2. `CancelSession`包发送的最佳时机：收到SessionStarted后，发送FinishSession之前。
3. 客户端在收到`SessionCanceled`包之后，如果想要继续合成，需要重新创建session，即重新执行`StartSession`。

**Connection 类：**

* `StartConnection`包（RequestMeta）：


| | | | || \
|Byte |Left 4-bit |Right 4-bit |备注 | |
|---|---|---|---|---|
| | | | | | \
|0 |0001 |0001 |v1 |4-byte header |
| | | | | | \
|1 |0001 |0100 |Full-client request |with event number |
| | | | | | \
|2 |0001 |0000 |JSON |no compression |
| | | | | | \
|3 |0000 |0000 | | |
| | || || \
|4 - 7 |int32(`Event_StartConnection`) | |event type | |
| | || || \
|8 - 11 |uint32(`2`) | |len(`<payload_json>`) | |
| | || || \
|12 - 93 |```JSON |\
| |{} |\
| |``` |\
| | | |`payload_json` |\
| | | |扩展保留，暂留空JSON | |


* `FinishConnection`包（RequestMeta）：


| | | | || \
|Byte |Left 4-bit |Right 4-bit |备注 | |
|---|---|---|---|---|
| | | | | | \
|0 |0001 |0001 |v1 |4-byte header |
| | | | | | \
|1 |0001 |0100 |Full-client request |with event number |
| | | | | | \
|2 |0001 |0000 |JSON |no compression |
| | | | | | \
|3 |0000 |0000 | | |
| | || || \
|4 - 7 |int32(`Event_FinishConnection`) | |event type | |
| | || || \
|8-11 |uint32(`2`) | |len(`payload_json`) | |
| | || || \
|12-13 |```JSON |\
| |{} |\
| |``` |\
| | | |`payload_json` |\
| | | |扩展保留，暂留空JSON | |


* `ConnectionStarted`包：


| | | | || \
|Byte |Left 4-bit |Right 4-bit |备注 | |
|---|---|---|---|---|
| | | | | | \
|0 |0001 |0001 |v1 |4-byte header |
| | | | | | \
|1 |1001 |0100 |Full-server response |with event number |
| | | | | | \
|2 |0001 |0000 |JSON |no compression |
| | | | | | \
|3 |0000 |0000 | | |
| | || || \
|4 - 7 |int32(`Event_ConnectionStarted`) | |event type | |
| | || || \
|8 - 11 |uint32(`7`) | |len(`<connection_id>`) | |
| | || || \
|12 - 18 |`bxnweiu` | |connection_id | |
| | || || \
|19 - 22 |uint32(`2`) | |len(`payload_json`) | |
| | || || \
|23 - 24 |```JSON |\
| |{} |\
| |``` |\
| | | |`payload_json` |\
| | | |扩展保留，暂留空JSON | |

  **允许**客户端不填`connection_id`，由网关下发一个唯一的ID

* `ConnectionFailed`包（ResponseMeta）：


| | | | || \
|Byte |Left 4-bit |Right 4-bit |备注 | |
|---|---|---|---|---|
| | | | | | \
|0 |0001 |0001 |v1 |4-byte header |
| | | | | | \
|1 |1001 |0100 |Full-server response |with event number |
| | | | | | \
|2 |0001 |0000 |JSON |no compression |
| | | | | | \
|3 |0000 |0000 | | |
| | || || \
|4 - 7 |int32(`Event_ConnectionFailed`) | |event type | |
| | || || \
|8 - 11 |uint32(`7`) | |len(`<connection_id>`) | |
| | || || \
|12 - 15 |uint32(`58`) | |len(`<response_meta_json>`) | |
| | || || \
|16 - 73 |```JSON |\
| |{ |\
| |  "status_code": 4xxxxxxx, |\
| |  "message": "unauthorized" |\
| |} |\
| |``` |\
| | | |response_meta_json |\
| | | | |\
| | | |* 既可能是客户端错误，又可能是服务端错误 |\
| | | |* 仅含status_code和message字段 | |

**Session 类：**

* `StartSession`包（RequestMeta）：


| | | | || \
|Byte |Left 4-bit |Right 4-bit |备注 | |
|---|---|---|---|---|
| | | | | | \
|0 |0001 |0001 |v1 |4-byte header |
| | | | | | \
|1 |0001 |0100 |Full-client request |with event number |
| | | | | | \
|2 |0001 |0000 |JSON |no compression |
| | | | | | \
|3 |0000 |0000 | | |
| | || || \
|4 - 7 |int32(`Event_StartSession`) | |event type | |
| | || || \
|8 - 11 |uint32(`12`) | |len(`<session_id>`) | |
| | || || \
|12 - 23 |`nxckjoejnkegf` | |session_id | |
| | || || \
|24 - 27 |uint32(`...`) | |len(`tts_session_meta`) | |
| | || || \
|28 - ... |```JSON |\
| |{ |\
| |  "user": ..., |\
| |  "req_params": ... |\
| |} |\
| |``` |\
| | | |tts_session_meta | |

  **不允许**客户端不填`session_id`

* `FinishSession`包（RequestMeta）：


| | | | || \
|Byte |Left 4-bit |Right 4-bit |备注 | |
|---|---|---|---|---|
| | | | | | \
|0 |0001 |0001 |v1 |4-byte header |
| | | | | | \
|1 |0001 |0100 |Full-client request |with event number |
| | | | | | \
|2 |0001 |0000 |JSON |no compression |
| | | | | | \
|3 |0000 |0000 | | |
| | || || \
|4 - 7 |int32(`Event_FinishSession`) | |event type | |
| | || || \
|8 - 11 |int32(`12`) | |len(`<session_id>`) | |
| | || || \
|12 - 23 |`nxckjoejnkegf` | |session_id | |
| | || || \
|24 - 27 |uint32(`2`) | |len(`payload_json`) | |
| | || || \
|28 - 29 |```JSON |\
| |{} |\
| |``` |\
| | | |`payload_json` |\
| | | |扩展保留，暂留空JSON | |


* `CancelSession`包（RequestMeta）：


| | | | || \
|Byte |Left 4-bit |Right 4-bit |备注 | |
|---|---|---|---|---|
| | | | | | \
|0 |0001 |0001 |v1 |4-byte header |
| | | | | | \
|1 |0001 |0100 |Full-client request |with event number |
| | | | | | \
|2 |0001 |0000 |JSON |no compression |
| | | | | | \
|3 |0000 |0000 | | |
| | || || \
|4 - 7 |int32(`Event_CancelSession`) | |event type | |
| | || || \
|8 - 11 |int32(`12`) | |len(`<session_id>`) | |
| | || || \
|12 - 23 |`nxckjoejnkegf` | |session_id | |
| | || || \
|24 - 27 |uint32(`2`) | |len(`payload_json`) | |
| | || || \
|28 - 29 |```JSON |\
| |{} |\
| |``` |\
| | | |`payload_json` |\
| | | |扩展保留，暂留空JSON | |


* `SessionStarted`包（ResponseMeta）：


| | | | || \
|Byte |Left 4-bit |Right 4-bit |备注 | |
|---|---|---|---|---|
| | | | | | \
|0 |0001 |0001 |v1 |4-byte header |
| | | | | | \
|1 |1001 |0100 |Full-server response |with event number |
| | | | | | \
|2 |0001 |0000 |JSON |no compression |
| | | | | | \
|3 |0000 |0000 | | |
| | || || \
|4 - 7 |int32(`Event_SessionStarted`) | |event type | |
| | || || \
|8 - 11 |uint32(`12`) | |len(`<session_id>`) | |
| | || || \
|12 - 23 |`nxckjoejnkegf` | |session_id | |
| | || || \
|24 - 27 |uint32(`2`) | |len(`payload_json`) | |
| | || || \
|28 - 29 |```JSON |\
| |{} |\
| |``` |\
| | | |`payload_json` |\
| | | |扩展保留，暂留空JSON | |


* `SessionFinished`包（ResponseMeta）：


| | | | || \
|Byte |Left 4-bit |Right 4-bit |备注 | |
|---|---|---|---|---|
| | | | | | \
|0 |0001 |0001 |v1 |4-byte header |
| | | | | | \
|1 |1001 |0100 |Full-server response |with event number |
| | | | | | \
|2 |0001 |0000 |JSON |no compression |
| | | | | | \
|3 |0000 |0000 | | |
| | || || \
|4 - 7 |int32(Event_SessionFinished) | |event type | |
| | || || \
|8 - 11 |uint32(`12`) | |len(`<session_id>`) | |
| | || || \
|12 - 23 |`nxckjoejnkegf` | |session_id | |
| | || || \
|24 - 27 |uint32(48) | |len(`<response_meta_json>`) | |
| | || || \
|28 - 75 |```JSON |\
| |{ |\
| |  "status_code": 20000000, |\
| |  "message": "ok"， |\
| |  "usage": { |\
| |        "text_words"：4 |\
| |   } |\
| |} |\
| |``` |\
| | | |response_meta_json |\
| | | | |\
| | | |* 含status_code和message字段 |\
| | | |* usage内容仅在X-Control-Require-Usage-Tokens-Return激活时返回 | |


* `SessionFailed`包（ResponseMeta）：与`SessionFinished`类似
* `SessionCanceled`包（ResponseMeta）：与`SessionFinished`类似

**数据类：**

* 音频，含Event（以上行`Event_TaskRequest`事件为例）：


| | | | || \
|Byte |Left 4-bit |Right 4-bit |备注 | |
|---|---|---|---|---|
| | | | | | \
|0 |0001 |0001 |v1 |4-byte header |
| | | | | | \
|1 |0010 |0100 |Audio-only request |with event number |
| | | | | | \
|2 |0000 |0000 |raw |no compression |
| | | | | | \
|3 |0000 |0000 | | |
| | || || \
|4 - 7 |int32(`Event_TaskRequest`) | |event type | |
| | || || \
|8 - 11 |uint32(`12`) | |len(`<session_id>`) | |
| | || || \
|12 - 23 |`nxckjoejnkegf` | |session_id | |
| | || || \
|24 - 27 |uint32(`...`) | |len(`<audios_binary>`) | |
| | || || \
|28 - ... |`...` | |audio_binary | |


* ~~音频，不含Event（以上行音频为例）：~~


| | | | || \
|Byte |Left 4-bit |Right 4-bit |备注 | |
|---|---|---|---|---|
| | | | | | \
|0 |0001 |0001 |v1 |4-byte header |
| | | | | | \
|1 |0010 |0000 |Audio-only request |no event number |
| | | | | | \
|2 |0000 |0000 |raw |no compression |
| | | | | | \
|3 |0000 |0000 | | |
| | || || \
|8 - 11 |uint32(`12`) | |len(`<session_id>`) | |
| | || || \
|12 - 23 |`nxckjoejnkegf` | |session_id | |
| | || || \
|24 - 27 |uint32(`...`) | |len(`<audios_binary>`) | |
| | || || \
|28 - ... |`...` | |audio_binary | |


* 文本，含Event（以上行`Event_TaskRequest`事件为例）：


| | | | || \
|Byte |Left 4-bit |Right 4-bit |备注 | |
|---|---|---|---|---|
| | | | | | \
|0 |0001 |0001 |v1 |4-byte header |
| | | | | | \
|1 |0001 |0100 |Full-client request |with event number |
| | | | | | \
|2 |0001 |0000 |JSON |no compression |
| | | | | | \
|3 |0000 |0000 | | |
| | || || \
|4 - 7 |int32(`Event_TaskRequest`) | |event type | |
| | || || \
|8 - 11 |uint32(`12`) | |len(`<session_id>`) | |
| | || || \
|12 - 23 |`nxckjoejnkegf` | |session_id | |
| | || || \
|24 - 27 |uint32(`...`) | |len(`<payload_json>`) | |
| | || || \
|28 - ... |`{...}` | |`payload_json` | |


<span id="46aecf36"></span>
# 4 错误码
<span id="9f240b7c"></span>
### 新框架错误码
```JSON
CodeOK Code = 20000000 //成功
CodeClientError Code = 45000000 //客户端通用错误
CodeServerError Code = 55000000 //服务端通用错误
CodeSessionError      Code = 55000001 //服务端session错误
CodeInvalidReqError   Code = 45000001 //客户端请求参数错误
```

<span id="fb95e54a"></span>
# 5 调用示例

```mixin-react
return (<Tabs>
<Tabs.TabPane title="Python调用示例" key="ehYS9EUXEV"><RenderMd content={`<span id="760142c1"></span>
### 前提条件

* 调用之前，您需要获取以下信息：
   * \`<appid>\`：使用控制台获取的APP ID，可参考 [控制台使用FAQ-Q1](https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F)。
   * \`<access_token>\`：使用控制台获取的Access Token，可参考 [控制台使用FAQ-Q1](https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F)。
   * \`<voice_type>\`：您预期使用的音色ID，可参考 [大模型音色列表](https://www.volcengine.com/docs/6561/1257544)。

<span id="1837262b"></span>
### Python环境

* Python：3.9版本及以上。
* Pip：25.1.1版本及以上。您可以使用下面命令安装。

\`\`\`Bash
python3 -m pip install --upgrade pip
\`\`\`

<span id="3ebd8c77"></span>
### 下载代码示例
<Attachment link="https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/f34520d15f9645acaf5af33afc434659~tplv-goo7wpa0wc-image.image" name="volcengine_bidirection_demo.tar.gz" ></Attachment>
<span id="16de5fc6"></span>
### 解压缩代码包，安装依赖
\`\`\`Bash
mkdir -p volcengine_bidirection_demo
tar xvzf volcengine_bidirection_demo.tar.gz -C ./volcengine_bidirection_demo
cd volcengine_bidirection_demo
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install --upgrade pip
pip3 install -e .
\`\`\`

<span id="4993939e"></span>
### 发起调用
> \`<appid>\`替换为您的APP ID。
> \`<access_token>\`替换为您的Access Token。
> \`<voice_type>\`替换为您预期使用的音色ID，例如\`zh_female_cancan_mars_bigtts\`。

\`\`\`Bash
python3 examples/volcengine/bidirection.py --appid <appid> --access_token <access_token> --voice_type <voice_type> --text "你好，我是火山引擎的语音合成服务。这是一个美好的旅程。" 
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Java调用示例" key="uoP11ylRUk"><RenderMd content={`<span id="02f52980"></span>
### 前提条件

* 调用之前，您需要获取以下信息：
   * \`<appid>\`：使用控制台获取的APP ID，可参考 [控制台使用FAQ-Q1](https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F)。
   * \`<access_token>\`：使用控制台获取的Access Token，可参考 [控制台使用FAQ-Q1](https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F)。
   * \`<voice_type>\`：您预期使用的音色ID，可参考 [大模型音色列表](https://www.volcengine.com/docs/6561/1257544)。

<span id="4b471d3a"></span>
### Java环境

* Java：21版本及以上。
* Maven：3.9.10版本及以上。

<span id="1c6d128d"></span>
### 下载代码示例
<Attachment link="https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/65aeb19506e64bee8aac7497ae06ba57~tplv-goo7wpa0wc-image.image" name="volcengine_bidirection_demo.tar.gz" ></Attachment>
<span id="7e37cd1a"></span>
### 解压缩代码包，安装依赖
\`\`\`Bash
mkdir -p volcengine_bidirection_demo
tar xvzf volcengine_bidirection_demo.tar.gz -C ./volcengine_bidirection_demo
cd volcengine_bidirection_demo
\`\`\`

<span id="216ef09f"></span>
### 发起调用
> \`<appid>\`替换为您的APP ID。
> \`<access_token>\`替换为您的Access Token。
> \`<voice_type>\`替换为您预期使用的音色ID，例如\`zh_female_cancan_mars_bigtts\`。

\`\`\`Bash
mvn compile exec:java -Dexec.mainClass=com.speech.volcengine.Bidirection -DappId=<appid> -DaccessToken=<access_token> -Dvoice=<voice_type> -Dtext="**你好**，我是豆包语音助手，很高兴认识你。这是一个愉快的旅程。"
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Go调用示例" key="SnltpcwtqD"><RenderMd content={`<span id="4b8f00a1"></span>
### 前提条件

* 调用之前，您需要获取以下信息：
   * \`<appid>\`：使用控制台获取的APP ID，可参考 [控制台使用FAQ-Q1](https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F)。
   * \`<access_token>\`：使用控制台获取的Access Token，可参考 [控制台使用FAQ-Q1](https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F)。
   * \`<voice_type>\`：您预期使用的音色ID，可参考 [大模型音色列表](https://www.volcengine.com/docs/6561/1257544)。

<span id="d9db4951"></span>
### Go环境

* Go：1.21.0版本及以上。

<span id="e02a532a"></span>
### 下载代码示例
<Attachment link="https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/7345e0a678c945fca5c430bac1494095~tplv-goo7wpa0wc-image.image" name="volcengine_bidirection_demo.tar.gz" ></Attachment>
<span id="d5ba0d7d"></span>
### 解压缩代码包，安装依赖
\`\`\`Bash
mkdir -p volcengine_bidirection_demo
tar xvzf volcengine_bidirection_demo.tar.gz -C ./volcengine_bidirection_demo
cd volcengine_bidirection_demo
\`\`\`

<span id="0208ef90"></span>
### 发起调用
> \`<appid>\`替换为您的APP ID。
> \`<access_token>\`替换为您的Access Token。
> \`<voice_type>\`替换为您预期使用的音色ID，例如\`zh_female_cancan_mars_bigtts\`。

\`\`\`Bash
go run volcengine/bidirection/main.go --appid <appid> --access_token <access_token> --voice_type <voice_type> --text "**你好**，我是火山引擎的语音合成服务。"
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="C#调用示例" key="e6ybjf6msn"><RenderMd content={`<span id="0a99bf3b"></span>
### 前提条件

* 调用之前，您需要获取以下信息：
   * \`<appid>\`：使用控制台获取的APP ID，可参考 [控制台使用FAQ-Q1](https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F)。
   * \`<access_token>\`：使用控制台获取的Access Token，可参考 [控制台使用FAQ-Q1](https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F)。
   * \`<voice_type>\`：您预期使用的音色ID，可参考 [大模型音色列表](https://www.volcengine.com/docs/6561/1257544)。

<span id="c09bcb89"></span>
### C#环境

* .Net 9.0版本。

<span id="b38492eb"></span>
### 下载代码示例
<Attachment link="https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/63bbdd9e0b7948f697867b32688eaca1~tplv-goo7wpa0wc-image.image" name="volcengine_bidirection_demo.tar.gz" ></Attachment>
<span id="2cc841a1"></span>
### 解压缩代码包，安装依赖
\`\`\`Bash
mkdir -p volcengine_bidirection_demo
tar xvzf volcengine_bidirection_demo.tar.gz -C ./volcengine_bidirection_demo
cd volcengine_bidirection_demo
\`\`\`

<span id="7c4ef117"></span>
### 发起调用
> \`<appid>\`替换为您的APP ID。
> \`<access_token>\`替换为您的Access Token。
> \`<voice_type>\`替换为您预期使用的音色ID，例如\`zh_female_cancan_mars_bigtts\`。

\`\`\`Bash
dotnet run --project Volcengine/Bidirection/Volcengine.Speech.Bidirection.csproj -- --appid <appid> --access_token <access_token> --voice_type <voice_type> --text "**你好**，这是一个测试文本。我们正在测试文本转语音功能。"
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="TypeScript调用示例" key="cSnHnumYHF"><RenderMd content={`<span id="d1ff3169"></span>
### 前提条件

* 调用之前，您需要获取以下信息：
   * \`<appid>\`：使用控制台获取的APP ID，可参考 [控制台使用FAQ-Q1](https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F)。
   * \`<access_token>\`：使用控制台获取的Access Token，可参考 [控制台使用FAQ-Q1](https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F)。
   * \`<voice_type>\`：您预期使用的音色ID，可参考 [大模型音色列表](https://www.volcengine.com/docs/6561/1257544)。

<span id="9d33c003"></span>
### node环境

* node：v24.0版本及以上。

<span id="7e88d56e"></span>
### 下载代码示例
<Attachment link="https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/5df0f0f77e714dd68dbed3c4b714314e~tplv-goo7wpa0wc-image.image" name="volcengine_bidirection_demo.tar.gz" ></Attachment>
<span id="e6abc9f3"></span>
### 解压缩代码包，安装依赖
\`\`\`Bash
mkdir -p volcengine_bidirection_demo
tar xvzf volcengine_bidirection_demo.tar.gz -C ./volcengine_bidirection_demo
cd volcengine_bidirection_demo
npm install
npm install -g typescript
npm install -g ts-node
\`\`\`

<span id="da29b1f5"></span>
### 发起调用
> \`<appid>\`替换为您的APP ID。
> \`<access_token>\`替换为您的Access Token。
> \`<voice_type>\`替换为您预期使用的音色ID，例如\`<voice_type>\`。

\`\`\`Bash
npx ts-node src/volcengine/bidirection.ts --appid <appid> --access_token <access_token> --voice_type <voice_type> --text "**你好**，我是火山引擎的语音合成服务。"
\`\`\`

`}></RenderMd></Tabs.TabPane></Tabs>);
 ```


<span id="在线音色列表"></span>
# 在线音色列表
注：下列音色中，中文音色亦具备英文能力，但英文场景下更推荐使用英文音色。
<span id="e7951cad"></span>
## <span style="background-color: rgba(183,237,177, 0.8)"><strong>"豆包语音合成模型2.0" 音色列表</strong></span>

| | | | | | \
|**场景** |**音色名称** |**voice_type** |**语种/方言** |**支持能力** |
|---|---|---|---|---|
| | | | | | \
|通用场景  |Vivi 2.0  |zh_female_vv_uranus_bigtts  |语种：中文、日文、印尼、墨西哥西班牙语  |\
| | | |方言：四川、陕西、东北  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |小何 2.0  |zh_female_xiaohe_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |云舟 2.0  |zh_male_m191_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |小天 2.0  |zh_male_taocheng_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |刘飞 2.0  |zh_male_liufei_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |魅力苏菲 2.0  |zh_female_sophie_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |清新女声 2.0  |zh_female_qingxinnvsheng_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |知性灿灿 2.0  |zh_female_cancan_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |撒娇学妹 2.0  |zh_female_sajiaoxuemei_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |甜美小源 2.0  |zh_female_tianmeixiaoyuan_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |甜美桃子 2.0  |zh_female_tianmeitaozi_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |爽快思思 2.0  |zh_female_shuangkuaisisi_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|视频配音  |佩奇猪 2.0  |zh_female_peiqi_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |邻家女孩 2.0  |zh_female_linjianvhai_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |少年梓辛/Brayan 2.0  |zh_male_shaonianzixin_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|视频配音  |猴哥 2.0  |zh_male_sunwukong_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|教育场景  |Tina老师 2.0  |zh_female_yingyujiaoxue_uranus_bigtts  |中文、英式英语  |情感变化、指令遵循、ASMR  |
| | | | | | \
|客服场景  |暖阳女声 2.0  |zh_female_kefunvsheng_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|有声阅读  |儿童绘本 2.0  |zh_female_xiaoxue_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|视频配音  |大壹 2.0  |zh_male_dayi_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|视频配音  |黑猫侦探社咪仔 2.0  |zh_female_mizai_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|视频配音  |鸡汤女 2.0  |zh_female_jitangnv_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |魅力女友 2.0  |zh_female_meilinvyou_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|视频配音  |流畅女声 2.0  |zh_female_liuchangnv_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|视频配音  |儒雅逸辰 2.0  |zh_male_ruyayichen_uranus_bigtts  |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|多语种  |Tim  |en_male_tim_uranus_bigtts  |美式英语  |情感变化、指令遵循、ASMR  |
| | | | | | \
|多语种  |Dacey  |en_female_dacey_uranus_bigtts  |美式英语  |情感变化、指令遵循、ASMR  |
| | | | | | \
|多语种  |Stokie  |en_female_stokie_uranus_bigtts  |美式英语  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |温柔妈妈 2.0 |zh_female_wenroumama_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |解说小明 2.0 |zh_male_jieshuoxiaoming_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |TVB女声 2.0 |zh_female_tvbnv_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |译制片男 2.0 |zh_male_yizhipiannan_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |俏皮女声 2.0 |zh_female_qiaopinv_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |直率英子 2.0 |zh_female_zhishuaiyingzi_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |邻家男孩 2.0 |zh_male_linjiananhai_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |四郎 2.0 |zh_male_silang_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |儒雅青年 2.0 |zh_male_ruyaqingnian_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |擎苍 2.0 |zh_male_qingcang_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |熊二 2.0 |zh_male_xionger_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |樱桃丸子 2.0 |zh_female_yingtaowanzi_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |温暖阿虎/Alvin 2.0 |zh_male_wennuanahu_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |奶气萌娃 2.0 |zh_male_naiqimengwa_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |婆婆 2.0 |zh_female_popo_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |高冷御姐 2.0 |zh_female_gaolengyujie_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |傲娇霸总 2.0 |zh_male_aojiaobazong_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |懒音绵宝 2.0 |zh_male_lanyinmianbao_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |反卷青年 2.0 |zh_male_fanjuanqingnian_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |温柔淑女 2.0 |zh_female_wenroushunv_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |古风少御 2.0 |zh_female_gufengshaoyu_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |活力小哥 2.0 |zh_male_huolixiaoge_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|有声阅读 |霸气青叔 2.0 |zh_male_baqiqingshu_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|有声阅读 |悬疑解说 2.0 |zh_male_xuanyijieshuo_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |萌丫头/Cutey 2.0 |zh_female_mengyatou_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |贴心女声/Candy 2.0 |zh_female_tiexinnvsheng_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |鸡汤妹妹/Hope 2.0 |zh_female_jitangmei_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景  |磁性解说男声/Morgan 2.0 |zh_male_cixingjieshuonan_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |亮嗓萌仔 2.0 |zh_male_liangsangmengzai_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |开朗姐姐 2.0 |zh_female_kailangjiejie_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |高冷沉稳 2.0 |zh_male_gaolengchenwen_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |深夜播客 2.0 |zh_male_shenyeboke_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |鲁班七号 2.0 |zh_male_lubanqihao_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |娇喘女声 2.0 |zh_female_jiaochuannv_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |林潇 2.0 |zh_female_linxiao_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |玲玲姐姐 2.0 |zh_female_lingling_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |春日部姐姐 2.0 |zh_female_chunribu_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |唐僧 2.0 |zh_male_tangseng_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |庄周 2.0 |zh_male_zhuangzhou_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |开朗弟弟 2.0 |zh_male_kailangdidi_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |猪八戒 2.0 |zh_male_zhubajie_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |感冒电音姐姐 2.0 |zh_female_ganmaodianyin_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |谄媚女声 2.0 |zh_female_chanmeinv_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |女雷神 2.0 |zh_female_nvleishen_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |亲切女声 2.0 |zh_female_qinqienv_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |快乐小东 2.0 |zh_male_kuailexiaodong_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |开朗学长 2.0 |zh_male_kailangxuezhang_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |悠悠君子 2.0 |zh_male_youyoujunzi_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |文静毛毛 2.0 |zh_female_wenjingmaomao_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |知性女声 2.0 |zh_female_zhixingnv_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |清爽男大 2.0 |zh_male_qingshuangnanda_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |渊博小叔 2.0 |zh_male_yuanboxiaoshu_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |阳光青年 2.0 |zh_male_yangguangqingnian_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |清澈梓梓 2.0 |zh_female_qingchezizi_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |甜美悦悦 2.0 |zh_female_tianmeiyueyue_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |心灵鸡汤 2.0 |zh_female_xinlingjitang_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |温柔小哥 2.0 |zh_male_wenrouxiaoge_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |柔美女友 2.0 |zh_female_roumeinvyou_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |东方浩然 2.0 |zh_male_dongfanghaoran_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |温柔小雅 2.0 |zh_female_wenrouxiaoya_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |天才童声 2.0 |zh_male_tiancaitongsheng_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |武则天 2.0 |zh_female_wuzetian_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |顾姐 2.0 |zh_female_gujie_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|通用场景 |广告解说 2.0 |zh_male_guanggaojieshuo_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|有声阅读 |少儿故事 2.0 |zh_female_shaoergushi_uranus_bigtts |中文  |情感变化、指令遵循、ASMR  |
| | | | | | \
|角色扮演  |调皮公主  |saturn_zh_female_tiaopigongzhu_tob  |中文  |指令遵循、COT/QA功能  |
| | | | | | \
|角色扮演  |可爱女生  |saturn_zh_female_keainvsheng_tob  |中文  |指令遵循、COT/QA功能  |
| | | | | | \
|角色扮演  |爽朗少年  |saturn_zh_male_shuanglangshaonian_tob  |中文  |指令遵循、COT/QA功能  |
| | | | | | \
|角色扮演  |天才同桌  |saturn_zh_male_tiancaitongzhuo_tob  |中文  |指令遵循、COT/QA功能  |
| | | | | | \
|角色扮演  |知性灿灿  |saturn_zh_female_cancan_tob  |中文  |指令遵循、COT/QA功能  |
| | | | | | \
|客服场景  |轻盈朵朵 2.0  |saturn_zh_female_qingyingduoduo_cs_tob  |中文  |指令遵循  |
| | | | | | \
|客服场景  |温婉珊珊 2.0  |saturn_zh_female_wenwanshanshan_cs_tob  |中文  |指令遵循  |
| | | | | | \
|客服场景  |热情艾娜 2.0  |saturn_zh_female_reqingaina_cs_tob  |中文  |指令遵循  |
| | | | | | \
|客服场景  |清新沐沐 2.0 |saturn_zh_male_qingxinmumu_cs_tob |中文  |指令遵循 |


<span id="fb89ea33"></span>
## <span style="background-color: rgba(183,237,177, 0.8)">"端到端实时语音大模型 S2S-O版本和SC-2.0版本 "音色列表</span>

| | | | | | | \
|**场景** |**音色名称** |**voice_type** |**语种** |**支持能力** |**是否支持MIX** |
|---|---|---|---|---|---|
| | | | | | | \
|S2S-Omni  |vivi  |zh_female_vv_jupiter_bigtts  |中文  | |否  |
|^^| | | | | | \
| |小何  |zh_female_xiaohe_jupiter_bigtts  |中文  | |否  |
|^^| | | | | | \
| |云舟  |zh_male_yunzhou_jupiter_bigtts  |中文  | |否  |
|^^| | | | | | \
| |小天  |zh_male_xiaotian_jupiter_bigtts  |中文  | |否  |
| | | | | | | \
|SC 2.0版本 |傲娇女友 |saturn_zh_female_aojiaonvyou_tob |中文  | |否  |
|^^| | | | | | \
| |病娇姐姐 |saturn_zh_female_bingjiaojiejie_tob |中文  | |否  |
|^^| | | | | | \
| |成熟姐姐 |saturn_zh_female_chengshujiejie_tob |中文  | |否  |
|^^| | | | | | \
| |可爱女生 |saturn_zh_female_keainvsheng_tob |中文  | |否  |
|^^| | | | | | \
| |暖心学姐 |saturn_zh_female_nuanxinxuejie_tob |中文  | |否  |
|^^| | | | | | \
| |贴心女友 |saturn_zh_female_tiexinnvyou_tob |中文  | |否  |
|^^| | | | | | \
| |温柔文雅 |saturn_zh_female_wenrouwenya_tob |中文  | |否  |
|^^| | | | | | \
| |妩媚御姐 |saturn_zh_female_wumeiyujie_tob |中文  | |否  |
|^^| | | | | | \
| |性感御姐 |saturn_zh_female_xingganyujie_tob |中文  | |否  |
|^^| | | | | | \
| |傲气凌人 |saturn_zh_male_aiqilingren_tob |中文  | |否  |
|^^| | | | | | \
| |傲娇公子 |saturn_zh_male_aojiaogongzi_tob |中文  | |否  |
|^^| | | | | | \
| |傲娇精英 |saturn_zh_male_aojiaojingying_tob |中文  | |否  |
|^^| | | | | | \
| |傲慢少爷 |saturn_zh_male_aomanshaoye_tob |中文  | |否  |
|^^| | | | | | \
| |霸道少爷 |saturn_zh_male_badaoshaoye_tob |中文  | |否  |
|^^| | | | | | \
| |病娇白莲 |saturn_zh_male_bingjiaobailian_tob |中文  | |否  |
|^^| | | | | | \
| |不羁青年 |saturn_zh_male_bujiqingnian_tob |中文  | |否  |
|^^| | | | | | \
| |成熟总裁 |saturn_zh_male_chengshuzongcai_tob |中文  | |否  |
|^^| | | | | | \
| |磁性男嗓 |saturn_zh_male_cixingnansang_tob |中文  | |否  |
|^^| | | | | | \
| |醋精男友 |saturn_zh_male_cujingnanyou_tob |中文  | |否  |
|^^| | | | | | \
| |风发少年 |saturn_zh_male_fengfashaonian_tob |中文  | |否  |
|^^| | | | | | \
| |腹黑公子 |saturn_zh_male_fuheigongzi_tob |中文  | |否  |


<span id="b912c0ff"></span>
## <span style="background-color: rgba(183,237,177, 0.8)"><strong>"豆包语音合成模型1.0" 音色列表</strong></span>
注：病弱少女、活泼女孩、和蔼奶奶、邻居阿姨四个音色暂不支持双向流式接口调用。
<span id="cc4435ee"></span>
### **情感参数（emotion）：**
括号内为对应的情感参数：
**中文音色：​**开心（`happy`），悲伤（`sad`），生气（`angry`），惊讶（`surprised`），恐惧（`fear`），厌恶（`hate`），激动（`excited`），冷漠（`coldness`），中性（`neutral`），沮丧（`depressed`），撒娇（`lovey-dovey`），害羞（`shy`），安慰鼓励（`comfort`），咆哮/焦急（`tension`），温柔（`tender`），讲故事 / 自然讲述（`storytelling`），情感电台（`radio`），磁性（`magnetic`），广告营销（`advertising`），气泡音（`vocal-fry`），低语 (`ASMR`)，新闻播报（`news`），娱乐八卦（`entertainment`），方言（`dialect`）
**英文音色：​**中性（`neutral`），愉悦（`happy`），愤怒（`angry`），悲伤（`sad`），兴奋（`excited`），对话 / 闲聊（`chat`），低语 (`ASMR`)，温暖（`warm`），深情（`affectionate`），权威（`authoritative`）

| | | | | | | | | \
|**场景** |**音色名称** |**voice_type** |**语种** |**支持的情感** |**上线业务方** |**对应2.0音色** |**是否支持MIX** |
|---|---|---|---|---|---|---|---|
| | | | | | | | | \
|多情感 |冷酷哥哥（多情感） |zh_male_lengkugege_emo_v2_mars_bigtts |中文 |生气、冷漠、恐惧、开心、厌恶、中性、悲伤、沮丧 | | |否 |
|^^| | | | | | | | \
| |甜心小美（多情感） |zh_female_tianxinxiaomei_emo_v2_mars_bigtts |中文 |悲伤、恐惧、厌恶、中性 |剪映 | |否 |
|^^| | | | | | | | \
| |高冷御姐（多情感） |zh_female_gaolengyujie_emo_v2_mars_bigtts |中文 |开心、悲伤、生气、惊讶、恐惧、厌恶、激动、冷漠、中性 |剪映 |高冷御姐 2.0 |否 |
|^^| | | | | | | | \
| |傲娇霸总（多情感） |zh_male_aojiaobazong_emo_v2_mars_bigtts |中文 |中性、开心、愤怒、厌恶 |剪映 |傲娇霸总 2.0 |否 |
|^^| | | | | | | | \
| |广州德哥（多情感） |zh_male_guangzhoudege_emo_mars_bigtts |中文 |生气、恐惧、中性 |剪映 | |是 |
|^^| | | | | | | | \
| |京腔侃爷（多情感） |zh_male_jingqiangkanye_emo_mars_bigtts |中文 |开心、生气、惊讶、厌恶、中性 |剪映 | |是 |
|^^| | | | | | | | \
| |邻居阿姨（多情感） |zh_female_linjuayi_emo_v2_mars_bigtts |中文 |中性、愤怒、冷漠、沮丧、惊讶 |剪映 | |否 |
|^^| | | | | | | | \
| |优柔公子（多情感） |zh_male_yourougongzi_emo_v2_mars_bigtts |中文 |开心、生气、恐惧、厌恶、激动、中性、沮丧 |剪映 | |否 |
|^^| | | | | | | | \
| |儒雅男友（多情感） |zh_male_ruyayichen_emo_v2_mars_bigtts |中文 |开心、悲伤、生气、恐惧、激动、冷漠、中性 |剪映 | |否 |
|^^| | | | | | | | \
| |俊朗男友（多情感） |zh_male_junlangnanyou_emo_v2_mars_bigtts |中文 |开心、悲伤、生气、惊讶、恐惧、中性 |剪映 | |否 |
|^^| | | | | | | | \
| |北京小爷（多情感） |zh_male_beijingxiaoye_emo_v2_mars_bigtts |中文 |生气，惊讶，恐惧，激动，冷漠，中性 | | |否 |
|^^| | | | | | | | \
| |柔美女友（多情感） |zh_female_roumeinvyou_emo_v2_mars_bigtts |中文 |开心，悲伤，生气，惊讶，恐惧，厌恶，激动，冷漠，中性 | | |否 |
|^^| | | | | | | | \
| |阳光青年（多情感） |zh_male_yangguangqingnian_emo_v2_mars_bigtts |中文 |开心，悲伤，生气，恐惧，激动，冷漠，中性 | | |否 |
|^^| | | | | | | | \
| |魅力女友（多情感） |zh_female_meilinvyou_emo_v2_mars_bigtts |中文 |悲伤，恐惧，中性 | |魅力女友 2.0 |否 |
|^^| | | | | | | | \
| |爽快思思（多情感） |zh_female_shuangkuaisisi_emo_v2_mars_bigtts |中文,英式英语 |开心，悲伤，生气，惊讶，激动，冷漠，中性 | |爽快思思 2.0 |否 |
|^^| | | | | | | | \
| |Candice |en_female_candice_emo_v2_mars_bigtts |美式英语 |深情、愤怒、ASMR、对话/闲聊、兴奋、愉悦、中性、温暖 | | |否 |
|^^| | | | | | | | \
| |Serena |en_female_skye_emo_v2_mars_bigtts |美式英语 |深情、愤怒、ASMR、对话/闲聊、兴奋、愉悦、中性、悲伤、温暖 | | |否 |
|^^| | | | | | | | \
| |Glen |en_male_glen_emo_v2_mars_bigtts |美式英语 |深情、愤怒、ASMR、对话/闲聊、深情、兴奋、愉悦、中性、悲伤、温暖 | | |否 |
|^^| | | | | | | | \
| |Sylus |en_male_sylus_emo_v2_mars_bigtts |美式英语 |深情、愤怒、ASMR、权威、对话/闲聊、兴奋、愉悦、中性、悲伤、温暖 | | |否 |
|^^| | | | | | | | \
| |Corey |en_male_corey_emo_v2_mars_bigtts |英式英语 |愤怒、ASMR、权威、对话/闲聊、深情、兴奋、愉悦、中性、悲伤、温暖 | | |否 |
|^^| | | | | | | | \
| |Nadia |en_female_nadia_tips_emo_v2_mars_bigtts |英式英语 |深情、愤怒、ASMR、对话/闲聊、深情、兴奋、愉悦、中性、悲伤、温暖 | | |否 |
|^^| | | | | | | | \
| |深夜播客 |zh_male_shenyeboke_emo_v2_mars_bigtts |中文 |惊讶、悲伤、中性、厌恶、开心、恐惧、激动、沮丧、冷漠、生气 |猫箱 |深夜播客 2.0 |否 |
| | | | | | | | | \
|教育场景 |Tina老师 |zh_female_yingyujiaoyu_mars_bigtts |中文,英式英语 | | |Tina老师 2.0 |是 |
| | | | | | | | | \
|通用场景  |温柔女神  |ICL_zh_female_wenrounvshen_239eff5e8ffa_tob  |中文  | |豆包  | |是  |
|^^| | | | | | | | \
| |Vivi |zh_female_vv_mars_bigtts |中文 | | |Vivi 2.0 |是 |
|^^| | | | | | | | \
| |亲切女声 |zh_female_qinqienvsheng_moon_bigtts |中文 | |豆包 |亲切女声 2.0 |是 |
|^^| | | | | | | | \
| |机灵小伙  |ICL_zh_male_shenmi_v1_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |元气甜妹  |ICL_zh_female_wuxi_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |知心姐姐  |ICL_zh_female_wenyinvsheng_v1_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |阳光阿辰 |zh_male_qingyiyuxuan_mars_bigtts |中文 | | | |是 |
|^^| | | | | | | | \
| |快乐小东 |zh_male_xudong_conversation_wvae_bigtts |中文 | |豆包,Cici,webdemo |快乐小东 2.0 |是 |
|^^| | | | | | | | \
| |冷酷哥哥  |ICL_zh_male_lengkugege_v1_tob  |中文  | |豆包  | |是  |
|^^| | | | | | | | \
| |纯澈女生  |ICL_zh_female_feicui_v1_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |初恋女友  |ICL_zh_female_yuxin_v1_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |贴心闺蜜  |ICL_zh_female_xnx_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |温柔白月光  |ICL_zh_female_yry_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |炀炀  |ICL_zh_male_BV705_streaming_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |开朗学长 |en_male_jason_conversation_wvae_bigtts |中文 | |豆包 |开朗学长 2.0 |是 |
|^^| | | | | | | | \
| |魅力苏菲 |zh_female_sophie_conversation_wvae_bigtts |中文 | | |魅力苏菲 2.0 |是 |
|^^| | | | | | | | \
| |贴心妹妹  |ICL_zh_female_yilin_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |甜美桃子 |zh_female_tianmeitaozi_mars_bigtts |中文 | | |甜美桃子 2.0 |是 |
|^^| | | | | | | | \
| |清新女声 |zh_female_qingxinnvsheng_mars_bigtts |中文 | | |清新女声 2.0 |是 |
|^^| | | | | | | | \
| |知性女声 |zh_female_zhixingnvsheng_mars_bigtts |中文 | | |知性女声 2.0 |是 |
|^^| | | | | | | | \
| |清爽男大 |zh_male_qingshuangnanda_mars_bigtts |中文 | |豆包 |清爽男大 2.0 |是 |
|^^| | | | | | | | \
| |邻家女孩 |zh_female_linjianvhai_moon_bigtts |中文 | |豆包、Cici |邻家女孩 2.0 |是 |
|^^| | | | | | | | \
| |渊博小叔 |zh_male_yuanboxiaoshu_moon_bigtts |中文 | |豆包、Cici、剪映 |渊博小叔 2.0 |是 |
|^^| | | | | | | | \
| |阳光青年 |zh_male_yangguangqingnian_moon_bigtts |中文 | |豆包、Cici、StoryAi |阳光青年 2.0 |是 |
|^^| | | | | | | | \
| |甜美小源 |zh_female_tianmeixiaoyuan_moon_bigtts |中文 | |豆包 |甜美小源 2.0 |是 |
|^^| | | | | | | | \
| |清澈梓梓 |zh_female_qingchezizi_moon_bigtts |中文 | |豆包 |清澈梓梓 2.0 |是 |
|^^| | | | | | | | \
| |解说小明 |zh_male_jieshuoxiaoming_moon_bigtts |中文 | |豆包 |解说小明 2.0 |是 |
|^^| | | | | | | | \
| |开朗姐姐 |zh_female_kailangjiejie_moon_bigtts |中文 | |豆包 |开朗姐姐 2.0 |是 |
|^^| | | | | | | | \
| |邻家男孩 |zh_male_linjiananhai_moon_bigtts |中文 | |豆包 |邻家男孩 2.0 |是 |
|^^| | | | | | | | \
| |甜美悦悦 |zh_female_tianmeiyueyue_moon_bigtts |中文 | |豆包 |甜美悦悦 2.0 |是 |
|^^| | | | | | | | \
| |心灵鸡汤 |zh_female_xinlingjitang_moon_bigtts |中文 | |豆包 |心灵鸡汤 2.0 |是 |
|^^| | | | | | | | \
| |知性温婉  |ICL_zh_female_zhixingwenwan_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |暖心体贴  |ICL_zh_male_nuanxintitie_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |开朗轻快  |ICL_zh_male_kailangqingkuai_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |活泼爽朗  |ICL_zh_male_huoposhuanglang_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |率真小伙  |ICL_zh_male_shuaizhenxiaohuo_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |温柔小哥 |zh_male_wenrouxiaoge_mars_bigtts |中文 | | |温柔小哥 2.0 |是 |
|^^| | | | | | | | \
| |灿灿/Shiny |zh_female_cancan_mars_bigtts |中文,美式英语 | | |知性灿灿 2.0 |是 |
|^^| | | | | | | | \
| |爽快思思/Skye |zh_female_shuangkuaisisi_moon_bigtts |中文,美式英语 | |豆包、Cici、webdemo |爽快思思 2.0 |是 |
|^^| | | | | | | | \
| |温暖阿虎/Alvin |zh_male_wennuanahu_moon_bigtts |中文,美式英语 | |豆包、Cici |温暖阿虎/Alvin 2.0 |是 |
|^^| | | | | | | | \
| |少年梓辛/Brayan |zh_male_shaonianzixin_moon_bigtts |中文,美式英语 | |豆包、Cici、剪映 |少年梓辛/Brayan 2.0 |是 |
| | | | | | | | | \
|通用场景、S2S-SC  |温柔文雅  |ICL_zh_female_wenrouwenya_tob  |中文  | |猫箱  | |是  |
| | | | | | | | | \
|IP仿音 |沪普男 |zh_male_hupunan_mars_bigtts |仅中文 | |豆包 | |是 |
|^^| | | | | | | | \
| |鲁班七号 |zh_male_lubanqihao_mars_bigtts |仅中文 | |抖音,剪映,豆包 |鲁班七号 2.0 |是 |
|^^| | | | | | | | \
| |林潇 |zh_female_yangmi_mars_bigtts |仅中文 | |剪映,抖音,豆包 |林潇 2.0 |是 |
|^^| | | | | | | | \
| |玲玲姐姐 |zh_female_linzhiling_mars_bigtts |仅中文 | |剪映,抖音,豆包 |玲玲姐姐 2.0 |是 |
|^^| | | | | | | | \
| |春日部姐姐 |zh_female_jiyejizi2_mars_bigtts |仅中文 | |抖音,剪映,豆包 |春日部姐姐 2.0 |是 |
|^^| | | | | | | | \
| |唐僧 |zh_male_tangseng_mars_bigtts |仅中文 | |抖音,豆包 |唐僧 2.0 |是 |
|^^| | | | | | | | \
| |庄周 |zh_male_zhuangzhou_mars_bigtts |仅中文 | |剪映,抖音 |庄周 2.0 |是 |
|^^| | | | | | | | \
| |猪八戒 |zh_male_zhubajie_mars_bigtts |仅中文 | |剪映订阅,火山TOB-TTS,豆包 |猪八戒 2.0 |是 |
|^^| | | | | | | | \
| |感冒电音姐姐 |zh_female_ganmaodianyin_mars_bigtts |仅中文 | |剪映,抖音 |感冒电音姐姐 2.0 |是 |
|^^| | | | | | | | \
| |直率英子 |zh_female_naying_mars_bigtts |仅中文 | |剪映,抖音,豆包 |直率英子 2.0 |是 |
|^^| | | | | | | | \
| |女雷神 |zh_female_leidian_mars_bigtts |仅中文 | |剪映,豆包 |女雷神 2.0 |是 |
| | | | | | | | | \
|趣味口音 |粤语小溏 |zh_female_yueyunv_mars_bigtts |中文 | | | |是 |
|^^| | | | | | | | \
| |豫州子轩 |zh_male_yuzhouzixuan_moon_bigtts |中文-河南口音 | |豆包 | |是 |
|^^| | | | | | | | \
| |呆萌川妹 |zh_female_daimengchuanmei_moon_bigtts |中文-四川口音 | |豆包、Cici | |是 |
|^^| | | | | | | | \
| |广西远舟 |zh_male_guangxiyuanzhou_moon_bigtts |中文-广西口音 | |豆包 | |是 |
|^^| | | | | | | | \
| |双节棍小哥 |zh_male_zhoujielun_emo_v2_mars_bigtts |中文-台湾口音 | |抖音,剪映,豆包 | |否 |
|^^| | | | | | | | \
| |湾湾小何 |zh_female_wanwanxiaohe_moon_bigtts |中文-台湾口音 | |豆包、Cici |小何 2.0 |是 |
|^^| | | | | | | | \
| |湾区大叔 |zh_female_wanqudashu_moon_bigtts |中文-广东口音 | |豆包、Cici | |是 |
|^^| | | | | | | | \
| |广州德哥 |zh_male_guozhoudege_moon_bigtts |中文-广东口音 | |豆包、Cici | |是 |
|^^| | | | | | | | \
| |浩宇小哥 |zh_male_haoyuxiaoge_moon_bigtts |中文-青岛口音 | |豆包 | |是 |
|^^| | | | | | | | \
| |北京小爷 |zh_male_beijingxiaoye_moon_bigtts |中文-北京口音 | |豆包 | |是 |
|^^| | | | | | | | \
| |京腔侃爷/Harmony |zh_male_jingqiangkanye_moon_bigtts |中文-北京口音,美式英语 | |豆包、Cici、webdemo | |是 |
|^^| | | | | | | | \
| |妹坨洁儿 |zh_female_meituojieer_moon_bigtts |中文-长沙口音 | |豆包、剪映 | |是 |
| | | | | | | | | \
|角色扮演  |纯真少女  |ICL_zh_female_chunzhenshaonv_e588402fb8ad_tob  |中文  | |豆包  | |是  |
|^^| | | | | | | | \
| |奶气小生  |ICL_zh_male_xiaonaigou_edf58cf28b8b_tob  |中文  | |豆包  | |是  |
|^^| | | | | | | | \
| |精灵向导  |ICL_zh_female_jinglingxiangdao_1beb294a9e3e_tob  |中文  | |豆包  | |是  |
|^^| | | | | | | | \
| |闷油瓶小哥  |ICL_zh_male_menyoupingxiaoge_ffed9fc2fee7_tob  |中文  | |豆包  | |是  |
|^^| | | | | | | | \
| |黯刃秦主  |ICL_zh_male_anrenqinzhu_cd62e63dcdab_tob  |中文  | |豆包  | |是  |
|^^| | | | | | | | \
| |霸道总裁  |ICL_zh_male_badaozongcai_v1_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |妩媚可人  |ICL_zh_female_ganli_v1_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |邪魅御姐  |ICL_zh_female_xiangliangya_v1_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |嚣张小哥  |ICL_zh_male_ms_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |油腻大叔  |ICL_zh_male_you_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |孤傲公子  |ICL_zh_male_guaogongzi_v1_tob  |中文  | |豆包  | |是  |
|^^| | | | | | | | \
| |胡子叔叔  |ICL_zh_male_huzi_v1_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |性感魅惑  |ICL_zh_female_luoqing_v1_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |病弱公子  |ICL_zh_male_bingruogongzi_tob  |中文  | |豆包  | |是  |
|^^| | | | | | | | \
| |邪魅女王  |ICL_zh_female_bingjiao3_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |傲慢青年  |ICL_zh_male_aomanqingnian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |醋精男生  |ICL_zh_male_cujingnansheng_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |爽朗少年  |ICL_zh_male_shuanglangshaonian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |撒娇男友  |ICL_zh_male_sajiaonanyou_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |温柔男友  |ICL_zh_male_wenrounanyou_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |温顺少年  |ICL_zh_male_wenshunshaonian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |粘人男友  |ICL_zh_male_naigounanyou_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |撒娇男生  |ICL_zh_male_sajiaonansheng_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |活泼男友  |ICL_zh_male_huoponanyou_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |甜系男友  |ICL_zh_male_tianxinanyou_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |活力青年  |ICL_zh_male_huoliqingnian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |开朗青年  |ICL_zh_male_kailangqingnian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |冷漠兄长  |ICL_zh_male_lengmoxiongzhang_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |天才同桌  |ICL_zh_male_tiancaitongzhuo_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |翩翩公子  |ICL_zh_male_pianpiangongzi_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |懵懂青年  |ICL_zh_male_mengdongqingnian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |冷脸兄长  |ICL_zh_male_lenglianxiongzhang_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |病娇少年  |ICL_zh_male_bingjiaoshaonian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |病娇男友  |ICL_zh_male_bingjiaonanyou_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |病弱少年  |ICL_zh_male_bingruoshaonian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |意气少年  |ICL_zh_male_yiqishaonian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |干净少年  |ICL_zh_male_ganjingshaonian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |冷漠男友  |ICL_zh_male_lengmonanyou_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |精英青年  |ICL_zh_male_jingyingqingnian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |热血少年  |ICL_zh_male_rexueshaonian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |清爽少年  |ICL_zh_male_qingshuangshaonian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |中二青年  |ICL_zh_male_zhongerqingnian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |凌云青年  |ICL_zh_male_lingyunqingnian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |自负青年  |ICL_zh_male_zifuqingnian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |不羁青年  |ICL_zh_male_bujiqingnian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |儒雅君子  |ICL_zh_male_ruyajunzi_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |低音沉郁  |ICL_zh_male_diyinchenyu_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |冷脸学霸  |ICL_zh_male_lenglianxueba_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |儒雅总裁  |ICL_zh_male_ruyazongcai_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |深沉总裁  |ICL_zh_male_shenchenzongcai_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |小侯爷  |ICL_zh_male_xiaohouye_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |孤高公子  |ICL_zh_male_gugaogongzi_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |仗剑君子  |ICL_zh_male_zhangjianjunzi_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |温润学者  |ICL_zh_male_wenrunxuezhe_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |亲切青年  |ICL_zh_male_qinqieqingnian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |温柔学长  |ICL_zh_male_wenrouxuezhang_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |高冷总裁  |ICL_zh_male_gaolengzongcai_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |冷峻高智  |ICL_zh_male_lengjungaozhi_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |孱弱少爷  |ICL_zh_male_chanruoshaoye_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |自信青年  |ICL_zh_male_zixinqingnian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |青涩青年  |ICL_zh_male_qingseqingnian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |学霸同桌  |ICL_zh_male_xuebatongzhuo_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |冷傲总裁  |ICL_zh_male_lengaozongcai_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |元气少年  |ICL_zh_male_yuanqishaonian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |洒脱青年  |ICL_zh_male_satuoqingnian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |直率青年  |ICL_zh_male_zhishuaiqingnian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |斯文青年  |ICL_zh_male_siwenqingnian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |俊逸公子  |ICL_zh_male_junyigongzi_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |仗剑侠客  |ICL_zh_male_zhangjianxiake_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |机甲智能  |ICL_zh_male_jijiaozhineng_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |奶气萌娃 |zh_male_naiqimengwa_mars_bigtts |中文 | |剪映、豆包 |奶气萌娃 2.0 |是 |
|^^| | | | | | | | \
| |婆婆 |zh_female_popo_mars_bigtts |中文 | |剪映C端、抖音、豆包 |婆婆 2.0 |是 |
|^^| | | | | | | | \
| |高冷御姐 |zh_female_gaolengyujie_moon_bigtts |中文 | |豆包、Cici |高冷御姐 2.0 |是 |
|^^| | | | | | | | \
| |傲娇霸总 |zh_male_aojiaobazong_moon_bigtts |中文 | |豆包 |傲娇霸总 2.0 |是 |
|^^| | | | | | | | \
| |魅力女友 |zh_female_meilinvyou_moon_bigtts |中文 | |豆包、剪映 |魅力女友 2.0 |是 |
|^^| | | | | | | | \
| |深夜播客 |zh_male_shenyeboke_moon_bigtts |中文 | |豆包 |深夜播客 2.0 |是 |
|^^| | | | | | | | \
| |柔美女友 |zh_female_sajiaonvyou_moon_bigtts |中文 | |豆包、剪映 |柔美女友 2.0 |是 |
|^^| | | | | | | | \
| |撒娇学妹 |zh_female_yuanqinvyou_moon_bigtts |中文 | |豆包、剪映 |撒娇学妹 2.0 |是 |
|^^| | | | | | | | \
| |病弱少女  |ICL_zh_female_bingruoshaonv_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |活泼女孩  |ICL_zh_female_huoponvhai_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |东方浩然 |zh_male_dongfanghaoran_moon_bigtts |中文 | |豆包 |东方浩然 2.0 |是 |
|^^| | | | | | | | \
| |绿茶小哥  |ICL_zh_male_lvchaxiaoge_tob  |中文  | |StoryAi、猫箱  | |是  |
|^^| | | | | | | | \
| |娇弱萝莉  |ICL_zh_female_jiaoruoluoli_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |冷淡疏离  |ICL_zh_male_lengdanshuli_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |憨厚敦实  |ICL_zh_male_hanhoudunshi_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |活泼刁蛮  |ICL_zh_female_huopodiaoman_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |固执病娇  |ICL_zh_male_guzhibingjiao_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |撒娇粘人  |ICL_zh_male_sajiaonianren_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |傲慢娇声  |ICL_zh_female_aomanjiaosheng_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |潇洒随性  |ICL_zh_male_xiaosasuixing_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |诡异神秘  |ICL_zh_male_guiyishenmi_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |儒雅才俊  |ICL_zh_male_ruyacaijun_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |正直青年  |ICL_zh_male_zhengzhiqingnian_tob  |中文  | |StoryAi、猫箱  | |是  |
|^^| | | | | | | | \
| |娇憨女王  |ICL_zh_female_jiaohannvwang_tob  |中文  | |StoryAi、猫箱  | |是  |
|^^| | | | | | | | \
| |病娇萌妹  |ICL_zh_female_bingjiaomengmei_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |青涩小生  |ICL_zh_male_qingsenaigou_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |纯真学弟  |ICL_zh_male_chunzhenxuedi_tob  |中文  | |豆包、猫箱  | |是  |
|^^| | | | | | | | \
| |优柔帮主  |ICL_zh_male_youroubangzhu_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |优柔公子  |ICL_zh_male_yourougongzi_tob  |中文  | |豆包、猫箱  | |是  |
|^^| | | | | | | | \
| |调皮公主  |ICL_zh_female_tiaopigongzhu_tob  |中文  | |猫箱  |  |是  |
|^^| | | | | | | | \
| |贴心男友  |ICL_zh_male_tiexinnanyou_tob  |中文  | |豆包、猫箱  | |是  |
|^^| | | | | | | | \
| |少年将军  |ICL_zh_male_shaonianjiangjun_tob  |中文  | |豆包、猫箱  | |是  |
|^^| | | | | | | | \
| |病娇哥哥  |ICL_zh_male_bingjiaogege_tob  |中文  | |豆包、猫箱  | |是  |
|^^| | | | | | | | \
| |学霸男同桌  |ICL_zh_male_xuebanantongzhuo_tob  |中文  | |豆包、猫箱  | |是  |
|^^| | | | | | | | \
| |幽默叔叔  |ICL_zh_male_youmoshushu_tob  |中文  | |豆包、猫箱  | |是  |
|^^| | | | | | | | \
| |假小子  |ICL_zh_female_jiaxiaozi_tob  |中文  | |豆包、猫箱  | |是  |
|^^| | | | | | | | \
| |温柔男同桌  |ICL_zh_male_wenrounantongzhuo_tob  |中文  | |豆包、猫箱  | |是  |
|^^| | | | | | | | \
| |幽默大爷  |ICL_zh_male_youmodaye_tob  |中文  | |豆包、猫箱  | |是  |
|^^| | | | | | | | \
| |枕边低语  |ICL_zh_male_asmryexiu_tob  |中文  | |抖音  | |是  |
|^^| | | | | | | | \
| |神秘法师  |ICL_zh_male_shenmifashi_tob  |中文  | |豆包、猫箱  | |是  |
|^^| | | | | | | | \
| |娇喘女声 |zh_female_jiaochuan_mars_bigtts |仅中文 | |剪映,抖音 |娇喘女声 2.0 |是 |
|^^| | | | | | | | \
| |开朗弟弟 |zh_male_livelybro_mars_bigtts |仅中文 | |剪映,抖音 |开朗弟弟 2.0 |是 |
|^^| | | | | | | | \
| |谄媚女声 |zh_female_flattery_mars_bigtts |仅中文 | |剪映,抖音 |谄媚女声 2.0 |是 |
|^^| | | | | | | | \
| |冷峻上司  |ICL_zh_male_lengjunshangsi_tob  |中文  | |豆包、猫箱  | |是  |
|^^| | | | | | | | \
| |寡言小哥  |ICL_zh_male_xiaoge_v1_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |清朗温润  |ICL_zh_male_renyuwangzi_v1_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |潇洒随性  |ICL_zh_male_xiaosha_v1_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |清冷矜贵  |ICL_zh_male_liyisheng_v1_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |沉稳优雅  |ICL_zh_male_qinglen_v1_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |清逸苏感  |ICL_zh_male_chongqingzhanzhan_v1_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |温柔内敛  |ICL_zh_male_xingjiwangzi_v1_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |低沉缱绻  |ICL_zh_male_sigeshiye_v1_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |蓝银草魂师  |ICL_zh_male_lanyingcaohunshi_v1_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |清冷高雅  |ICL_zh_female_liumengdie_v1_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |甜美娇俏  |ICL_zh_female_linxueying_v1_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |柔骨魂师  |ICL_zh_female_rouguhunshi_v1_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |甜美活泼  |ICL_zh_female_tianmei_v1_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |成熟温柔  |ICL_zh_female_chengshu_v1_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |贴心闺蜜  |ICL_zh_female_xnx_v1_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |温柔白月光  |ICL_zh_female_yry_v1_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |高冷沉稳 |zh_male_bv139_audiobook_ummv3_bigtts |中文 | |猫箱 |高冷沉稳 2.0 |是 |
| | | | | | | | | \
|角色扮演、S2S-SC  |醋精男友  |ICL_zh_male_cujingnanyou_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |风发少年  |ICL_zh_male_fengfashaonian_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |磁性男嗓  |ICL_zh_male_cixingnansang_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |成熟总裁  |ICL_zh_male_chengshuzongcai_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |傲娇精英  |ICL_zh_male_aojiaojingying_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |傲娇公子  |ICL_zh_male_aojiaogongzi_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |霸道少爷  |ICL_zh_male_badaoshaoye_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |腹黑公子  |ICL_zh_male_fuheigongzi_tob  |中文  | |StoryAi、猫箱  | |是  |
|^^| | | | | | | | \
| |暖心学姐  |ICL_zh_female_nuanxinxuejie_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |可爱女生  |ICL_zh_female_keainvsheng_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |成熟姐姐  |ICL_zh_female_chengshujiejie_tob  |中文  | |豆包、猫箱  | |是  |
|^^| | | | | | | | \
| |病娇姐姐  |ICL_zh_female_bingjiaojiejie_tob  |中文  | |豆包、猫箱  | |是  |
|^^| | | | | | | | \
| |妩媚御姐  |ICL_zh_female_wumeiyujie_tob  |中文  | |豆包、StoryAi  | |是  |
|^^| | | | | | | | \
| |傲娇女友  |ICL_zh_female_aojiaonvyou_tob  |中文  | |豆包、猫箱  | |是  |
|^^| | | | | | | | \
| |贴心女友  |ICL_zh_female_tiexinnvyou_tob  |中文  | |豆包、猫箱  | |是  |
|^^| | | | | | | | \
| |性感御姐  |ICL_zh_female_xingganyujie_tob  |中文  | |豆包、猫箱  | |是  |
|^^| | | | | | | | \
| |病娇弟弟  |ICL_zh_male_bingjiaodidi_tob  |中文  | |豆包、猫箱  | |是  |
|^^| | | | | | | | \
| |傲慢少爷  |ICL_zh_male_aomanshaoye_tob  |中文  | |豆包、猫箱  | |是  |
|^^| | | | | | | | \
| |傲气凌人  |ICL_zh_male_aiqilingren_tob  |中文  | |猫箱  | |是  |
|^^| | | | | | | | \
| |病娇白莲  |ICL_zh_male_bingjiaobailian_tob  |中文  | |猫箱  | |是  |
| | | | | | | | | \
|多语种 |Lauren |en_female_lauren_moon_bigtts |美式英语 | | | |是 |
|^^| | | | | | | | \
| |EnergeticMaleII |en_male_campaign_jamal_moon_bigtts |美式英语 | | | |是 |
|^^| | | | | | | | \
| |GothamHero |en_male_chris_moon_bigtts |美式英语 | | | |是 |
|^^| | | | | | | | \
| |FlirtyFemale |en_female_product_darcie_moon_bigtts |美式英语 | | | |是 |
|^^| | | | | | | | \
| |PeacefulFemale |en_female_emotional_moon_bigtts |美式英语 | | | |是 |
|^^| | | | | | | | \
| |Nara |en_female_nara_moon_bigtts |美式英语 | | | |是 |
|^^| | | | | | | | \
| |Bruce |en_male_bruce_moon_bigtts |美式英语 | | | |是 |
|^^| | | | | | | | \
| |Michael |en_male_michael_moon_bigtts |美式英语 | | | |是 |
|^^| | | | | | | | \
| |Cartoon Chef  |ICL_en_male_cc_sha_v1_tob  |美式英语  | |CC  | |是  |
|^^| | | | | | | | \
| |Lucas |zh_male_M100_conversation_wvae_bigtts |美式英语 | |豆包,Cici,webdemo | |是 |
|^^| | | | | | | | \
| |Sophie |zh_female_sophie_conversation_wvae_bigtts |美式英语 | | | |是 |
|^^| | | | | | | | \
| |Daisy |en_female_dacey_conversation_wvae_bigtts |美式英语 | |豆包,Cici,webdemo | |是 |
|^^| | | | | | | | \
| |Owen |en_male_charlie_conversation_wvae_bigtts |美式英语 | |豆包,Cici | |是 |
|^^| | | | | | | | \
| |Luna |en_female_sarah_new_conversation_wvae_bigtts |美式英语 | |豆包,Cici,webdemo | |是 |
|^^| | | | | | | | \
| |Michael  |ICL_en_male_michael_tob  |美式英语  | |豆包  | |是  |
|^^| | | | | | | | \
| |Charlie  |ICL_en_female_cc_cm_v1_tob  |美式英语  | |CC  | |是  |
|^^| | | | | | | | \
| |Big Boogie  |ICL_en_male_oogie2_tob  |美式英语  | |TT,豆包  | |是  |
|^^| | | | | | | | \
| |Frosty Man  |ICL_en_male_frosty1_tob  |美式英语  | |TT,豆包  | |是  |
|^^| | | | | | | | \
| |The Grinch  |ICL_en_male_grinch2_tob  |美式英语  | |TT,豆包  | |是  |
|^^| | | | | | | | \
| |Zayne  |ICL_en_male_zayne_tob  |美式英语  | |CC  | |是  |
|^^| | | | | | | | \
| |Jigsaw  |ICL_en_male_cc_jigsaw_tob  |美式英语  | |CC  | |是  |
|^^| | | | | | | | \
| |Chucky  |ICL_en_male_cc_chucky_tob  |美式英语  | |CC  | |是  |
|^^| | | | | | | | \
| |Clown Man  |ICL_en_male_cc_penny_v1_tob  |美式英语  | |CC  | |是  |
|^^| | | | | | | | \
| |Kevin McCallister  |ICL_en_male_kevin2_tob  |美式英语  | |豆包  | |是  |
|^^| | | | | | | | \
| |Xavier  |ICL_en_male_xavier1_v1_tob  |美式英语  | |CC  | |是  |
|^^| | | | | | | | \
| |Noah  |ICL_en_male_cc_dracula_v1_tob  |美式英语  | |CC  | |是  |
|^^| | | | | | | | \
| |Adam |en_male_adam_mars_bigtts |美式英语 | | | |是 |
|^^| | | | | | | | \
| |Amanda |en_female_amanda_mars_bigtts |美式英语 | | | |是 |
|^^| | | | | | | | \
| |Jackson |en_male_jackson_mars_bigtts |美式英语 | | | |是 |
|^^| | | | | | | | \
| |DelicateGirl |en_female_daisy_moon_bigtts |英式英语 | | | |是 |
|^^| | | | | | | | \
| |Dave |en_male_dave_moon_bigtts |英式英语 | | | |是 |
|^^| | | | | | | | \
| |Hades |en_male_hades_moon_bigtts |英式英语 | | | |是 |
|^^| | | | | | | | \
| |Onez |en_female_onez_moon_bigtts |英式英语 | | | |是 |
|^^| | | | | | | | \
| |Emily |en_female_emily_mars_bigtts |英式英语 | |豆包 | |是 |
|^^| | | | | | | | \
| |Daniel |zh_male_xudong_conversation_wvae_bigtts |英式英语 | |豆包,Cici,webdemo | |是 |
|^^| | | | | | | | \
| |Alastor  |ICL_en_male_cc_alastor_tob  |英式英语  | |CC  | |是  |
|^^| | | | | | | | \
| |Smith |en_male_smith_mars_bigtts |英式英语 | | | |是 |
|^^| | | | | | | | \
| |Anna |en_female_anna_mars_bigtts |英式英语 | | | |是 |
|^^| | | | | | | | \
| |Ethan  |ICL_en_male_aussie_v1_tob  |澳洲英语  | |CC  | |是  |
|^^| | | | | | | | \
| |Sarah |en_female_sarah_mars_bigtts |澳洲英语 | | | |是 |
|^^| | | | | | | | \
| |Dryw |en_male_dryw_mars_bigtts |澳洲英语 | | | |是 |
|^^| | | | | | | | \
| |Diana |multi_female_maomao_conversation_wvae_bigtts |西语 | |Cici | |否 |
|^^| | | | | | | | \
| |Lucía |multi_male_M100_conversation_wvae_bigtts |西语 | |Cici | |否 |
|^^| | | | | | | | \
| |Sofía |multi_female_sophie_conversation_wvae_bigtts |西语 | | | |否 |
|^^| | | | | | | | \
| |Daníel |multi_male_xudong_conversation_wvae_bigtts |西语 | | | |否 |
|^^| | | | | | | | \
| |ひかる（光） |multi_zh_male_youyoujunzi_moon_bigtts |日语 | |Cici | |否 |
|^^| | | | | | | | \
| |さとみ（智美） |multi_female_sophie_conversation_wvae_bigtts |日语 | | | |否 |
|^^| | | | | | | | \
| |まさお（正男） |multi_male_xudong_conversation_wvae_bigtts |日语 | | | |否 |
|^^| | | | | | | | \
| |つき（月） |multi_female_maomao_conversation_wvae_bigtts |日语 | |Cici | |否 |
|^^| | | | | | | | \
| |あけみ（朱美） |multi_female_gaolengyujie_moon_bigtts |日语 | |Cici | |否 |
|^^| | | | | | | | \
| |かずね（和音）/JavierorÁlvaro |multi_male_jingqiangkanye_moon_bigtts |日语,西语 | |Cici | |否 |
|^^| | | | | | | | \
| |はるこ（晴子）/Esmeralda |multi_female_shuangkuaisisi_moon_bigtts |日语,西语 | |Cici | |否 |
|^^| | | | | | | | \
| |ひろし（広志）/Roberto |multi_male_wanqudashu_moon_bigtts |日语,西语 | |Cici | |否 |
| | | | | | | | | \
|客服场景  |理性圆子  |ICL_zh_female_lixingyuanzi_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |清甜桃桃  |ICL_zh_female_qingtiantaotao_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |清晰小雪  |ICL_zh_female_qingxixiaoxue_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |清甜莓莓  |ICL_zh_female_qingtianmeimei_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |开朗婷婷  |ICL_zh_female_kailangtingting_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |清新沐沐  |ICL_zh_male_qingxinmumu_cs_tob  |中文  | | |清新沐沐 2.0 |是  |
|^^| | | | | | | | \
| |爽朗小阳  |ICL_zh_male_shuanglangxiaoyang_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |清新波波  |ICL_zh_male_qingxinbobo_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |温婉珊珊  |ICL_zh_female_wenwanshanshan_cs_tob  |中文  | | |温婉珊珊 2.0 |是  |
|^^| | | | | | | | \
| |甜美小雨  |ICL_zh_female_tianmeixiaoyu_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |热情艾娜  |ICL_zh_female_reqingaina_cs_tob  |中文  | | |热情艾娜 2.0 |是  |
|^^| | | | | | | | \
| |甜美小橘  |ICL_zh_female_tianmeixiaoju_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |沉稳明仔  |ICL_zh_male_chenwenmingzai_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |亲切小卓  |ICL_zh_male_qinqiexiaozhuo_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |灵动欣欣  |ICL_zh_female_lingdongxinxin_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |乖巧可儿  |ICL_zh_female_guaiqiaokeer_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |暖心茜茜  |ICL_zh_female_nuanxinqianqian_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |软萌团子  |ICL_zh_female_ruanmengtuanzi_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |阳光洋洋  |ICL_zh_male_yangguangyangyang_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |软萌糖糖  |ICL_zh_female_ruanmengtangtang_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |秀丽倩倩  |ICL_zh_female_xiuliqianqian_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |开心小鸿  |ICL_zh_female_kaixinxiaohong_cs_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |轻盈朵朵  |ICL_zh_female_qingyingduoduo_cs_tob  |中文  | | |轻盈朵朵 2.0 |是  |
|^^| | | | | | | | \
| |暖阳女声 |zh_female_kefunvsheng_mars_bigtts |仅中文 | | |暖阳女声 2.0 |是 |
| | | | | | | | | \
|视频配音 |悠悠君子 |zh_male_M100_conversation_wvae_bigtts |中文 | |豆包,Cici,webdemo |悠悠君子 2.0 |是 |
|^^| | | | | | | | \
| |文静毛毛 |zh_female_maomao_conversation_wvae_bigtts |中文 | |豆包,webdemo |文静毛毛 2.0 |是 |
|^^| | | | | | | | \
| |倾心少女  |ICL_zh_female_qiuling_v1_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |醇厚低音  |ICL_zh_male_buyan_v1_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |咆哮小哥  |ICL_zh_male_BV144_paoxiaoge_v1_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |和蔼奶奶  |ICL_zh_female_heainainai_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |邻居阿姨  |ICL_zh_female_linjuayi_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |温柔小雅 |zh_female_wenrouxiaoya_moon_bigtts |中文 | |豆包 |温柔小雅 2.0 |是 |
|^^| | | | | | | | \
| |天才童声 |zh_male_tiancaitongsheng_mars_bigtts |中文 | | |天才童声 2.0 |是 |
|^^| | | | | | | | \
| |猴哥 |zh_male_sunwukong_mars_bigtts |中文 | | |猴哥 2.0 |是 |
|^^| | | | | | | | \
| |熊二 |zh_male_xionger_mars_bigtts |中文 | |抖音、剪映C端、豆包 |熊二 2.0 |是 |
|^^| | | | | | | | \
| |佩奇猪 |zh_female_peiqi_mars_bigtts |中文 | |抖音、剪映订阅、豆包 |佩奇猪 2.0 |是 |
|^^| | | | | | | | \
| |武则天 |zh_female_wuzetian_mars_bigtts |中文 | |剪映 |武则天 2.0 |是 |
|^^| | | | | | | | \
| |顾姐 |zh_female_gujie_mars_bigtts |中文 | |抖音、剪映C端 |顾姐 2.0 |是 |
|^^| | | | | | | | \
| |樱桃丸子 |zh_female_yingtaowanzi_mars_bigtts |中文 | |剪映订阅、抖音、豆包 |樱桃丸子 2.0 |是 |
|^^| | | | | | | | \
| |广告解说 |zh_male_chunhui_mars_bigtts |中文 | |剪映 |广告解说 2.0 |是 |
|^^| | | | | | | | \
| |少儿故事 |zh_female_shaoergushi_mars_bigtts |中文 | | |少儿故事 2.0 |是 |
|^^| | | | | | | | \
| |四郎 |zh_male_silang_mars_bigtts |中文 | |抖音、剪映C端、豆包 |四郎 2.0 |是 |
|^^| | | | | | | | \
| |俏皮女声 |zh_female_qiaopinvsheng_mars_bigtts |中文 | | |俏皮女声 2.0 |是 |
|^^| | | | | | | | \
| |懒音绵宝 |zh_male_lanxiaoyang_mars_bigtts |中文 | | |懒音绵宝 2.0 |是 |
|^^| | | | | | | | \
| |亮嗓萌仔 |zh_male_dongmanhaimian_mars_bigtts |中文 | | |亮嗓萌仔 2.0 |是 |
|^^| | | | | | | | \
| |磁性解说男声/Morgan |zh_male_jieshuonansheng_mars_bigtts |中文,美式英语 | |抖音、剪映 |磁性解说男声/Morgan 2.0 |是 |
|^^| | | | | | | | \
| |鸡汤妹妹/Hope |zh_female_jitangmeimei_mars_bigtts |中文,美式英语 | |抖音、豆包 |鸡汤妹妹/Hope 2.0 |是 |
|^^| | | | | | | | \
| |贴心女声/Candy |zh_female_tiexinnvsheng_mars_bigtts |中文,美式英语 | | |贴心女声/Candy 2.0 |是 |
|^^| | | | | | | | \
| |萌丫头/Cutey |zh_female_mengyatou_mars_bigtts |中文,美式英语 | | |萌丫头/Cutey 2.0 |是 |
| | | | | | | | | \
|有声阅读  |内敛才俊  |ICL_zh_male_neiliancaijun_e991be511569_tob  |中文  | | | |是  |
|^^| | | | | | | | \
| |温暖少年  |ICL_zh_male_yangyang_v1_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |儒雅公子  |ICL_zh_male_flc_v1_tob  |中文  | |StoryAi  | |是  |
|^^| | | | | | | | \
| |悬疑解说 |zh_male_changtianyi_mars_bigtts |中文 | |剪映C端、抖音、豆包 |悬疑解说 2.0 |是 |
|^^| | | | | | | | \
| |儒雅青年 |zh_male_ruyaqingnian_mars_bigtts |中文 | |番茄小说、豆包、剪映 |儒雅青年 2.0 |是 |
|^^| | | | | | | | \
| |霸气青叔 |zh_male_baqiqingshu_mars_bigtts |中文 | |番茄小说、豆包、剪映、剪映-Dreamina |霸气青叔 2.0 |是 |
|^^| | | | | | | | \
| |擎苍 |zh_male_qingcang_mars_bigtts |中文 | |番茄小说、剪映、豆包、抖音 |擎苍 2.0 |是 |
|^^| | | | | | | | \
| |活力小哥 |zh_male_yangguangqingnian_mars_bigtts |中文 | | |活力小哥 2.0 |是 |
|^^| | | | | | | | \
| |古风少御 |zh_female_gufengshaoyu_mars_bigtts |中文 | | |古风少御 2.0 |是 |
|^^| | | | | | | | \
| |温柔淑女 |zh_female_wenroushunv_mars_bigtts |中文 | |番茄小说、豆包、剪映、剪映-Dreamina |温柔淑女 2.0 |是 |
|^^| | | | | | | | \
| |反卷青年 |zh_male_fanjuanqingnian_mars_bigtts |中文 | | |反卷青年 2.0 |是 |









