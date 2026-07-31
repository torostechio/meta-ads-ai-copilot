import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
app.use(express.json());
// HTML ve Statik dosyaları sunmak için
app.use(express.static('public'));

// Google Gen AI İstemcisini Başlat
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// AI'ın Döndüreceği Sabit JSON Şeması (Structured Output)
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    botMessage: {
      type: Type.STRING,
      description: "Kullanıcıya verilecek pazarlama uzmanı yanıtı ve TEK BIR yönlendirici soru."
    },
    reasoning: {
      type: Type.STRING,
      description: "AI'ın bu adımdaki stratejik düşünce süreci ve yapılan değişikliklerin/kararların NEDENİ."
    },
    checklistStatus: {
      type: Type.OBJECT,
      description: "20 Alanlık Çetele Verisi (Bilinmeyen/Emin olunmayan alanlar KESİNLİKLE null kalmalıdır)",
      properties: {
        cat1_kampanya_adi: { type: Type.STRING, nullable: true },
        cat1_kampanya_amaci: { type: Type.STRING, nullable: true },
        cat2_butce_tipi: { type: Type.STRING, nullable: true },
        cat2_butce_miktari: { type: Type.STRING, nullable: true },
        cat2_butce_stratejisi: { type: Type.STRING, nullable: true },
        cat3_reklam_seti_adi: { type: Type.STRING, nullable: true },
        cat3_donusum_konumu: { type: Type.STRING, nullable: true },
        cat4_konum: { type: Type.STRING, nullable: true },
        cat4_yas_araligi: { type: Type.STRING, nullable: true },
        cat4_cinsiyet: { type: Type.STRING, nullable: true },
        cat4_diller: { type: Type.STRING, nullable: true },
        cat5_ilgi_alanlari: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
        cat6_yayin_alanlari: { type: Type.STRING, nullable: true },
        cat7_reklam_adi: { type: Type.STRING, nullable: true },
        cat7_facebook_instagram: { type: Type.STRING, nullable: true },
        cat7_medya_formati: { type: Type.STRING, nullable: true },
        cat8_ana_metin: { type: Type.STRING, nullable: true },
        cat8_baslik: { type: Type.STRING, nullable: true },
        cat8_cta_butonu: { type: Type.STRING, nullable: true },
        cat8_hedef_url: { type: Type.STRING, nullable: true }
      }
      // required KAPATILDI: Böylece henüz bilinmeyen alanlar rahatça null dönebilir!
    },
    isReady: {
      type: Type.BOOLEAN,
      description: "20 alanın tamamı veya reklama çıkılacak kritik alanlar doldu mu?"
    }
  },
  required: ["botMessage", "reasoning", "checklistStatus", "isReady"]
};

// Sert, Çelişkisiz ve Adım Adım Çalışan Sistem Talimatı
const SYSTEM_INSTRUCTION = `
Sen kıdemli bir Dijital Pazarlama ve Meta Ads Uzmanısın.
Amacın: Kullanıcıyla ADIM ADIM sohbet ederek Meta reklam kampanyasının 20 parametresini tespit etmek.

// Kampanya Amacı kuralı:
cat1_kampanya_amaci alanı SADECE şu 6 seçenekten biri olabilir (Meta panelindeki birebir karşılıkları): 
'Bilinirlik', 'Trafik', 'Etkileşim', 'Potansiyel Müşteriler', 'Uygulama tanıtımı', 'Satışlar'. 
ASLA 'Dönüşüm' kelimesini kullanma, e-ticaret/satış için 'Satışlar' veya 'Trafik' seç!

ÇOK ÖNEMLİ VE KESİN KURALLAR:
1. Kullanıcının açıkça SÖYLEMEDİĞİ veya sohbetin gidişatından KESİN OLARAK ÇIKARILAMAYAN alanları KESİNLİKLE UYDURMA! 
2. Bilmediğin/emin olmadığın alanlar için JSON çıktısında O ALANI 'null' BIRAK!
3. İlk mesajlarda (Örn: "Startup kurdum" veya "Selam") sadece 1-2 belirgin alanı doldur, GERİ KALAN TÜM ALANLARI 'null' YAP.
4. Sohbet ilerledikçe kullanıcı veri verdikçe alanları 2'şer 3'er YAVAŞ YAVAŞ doldur.
5. Kullanıcıya Her Yanıtta SADECE 1 ADET Net Soru Sor. Soru yağmuruna tutma!
6. reasoning alanında: Bu adımda hangi alanları doldurduğunu veya güncellediğini ve bunun PAZARLAMA/STRATEJİ SEBEBİNİ 1-2 kısa cümleyle açıkla (Örn: "Kullanıcı soğuk kahve satışı yapacağını belirttiği için kampanya amacı Satışlar olarak belirlendi").

SON AŞAMA VE DERLEME KURALI:
- Reklam parametrelerinin çoğu (özellikle Bütçe, Hedef Kitle, Metinler, URL) dolduğunda ve isReady: true aşamasına yaklaştığında; kullanıcıyı tebrik et. 
- "Kampanya mimarimizi %80+ oranında tamamladık! Dilerseniz ekrandaki 'Kampanyayı Derle' butonuna basarak adım adım kuruluma geçebiliriz veya eklemek istediğiniz başka bir detay varsa konuşabiliriz." şeklinde yönlendir.

ÇETELE ALANLARI:
1. Kampanya Adı, 2. Kampanya Amacı, 3. Bütçe Tipi, 4. Bütçe Miktarı, 5. Bütçe Stratejisi,
6. Reklam Seti Adı, 7. Dönüşüm Konumu, 8. Konum, 9. Yaş Aralığı, 10. Cinsiyet, 11. Diller,
12. İlgi Alanları, 13. Yayın Alanları, 14. Reklam Adı, 15. Sayfa Kimliği, 16. Medya Formatı,
17. Primary Text, 18. Headline, 19. CTA Butonu, 20. Hedef URL.
`;

// Chat API Endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { history, message } = req.body;

    const contents = [
      ...(history || []),
      { role: 'user', parts: [{ text: message }] }
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite', // İstenildiği gibi değiştirilmeden bırakıldı
      contents: contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.3, // Düşük sıcaklık: Uydurmayı (hallucination) engeller, talimata sadık tutar!
      }
    });

    const aiData = JSON.parse(response.text);

    res.json({
      success: true,
      data: aiData
    });

  } catch (error) {
    console.error("AI Hatası:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server ${PORT} portunda hazır! Gemini AI akıllı ve stratejik modda aktif.`);
});