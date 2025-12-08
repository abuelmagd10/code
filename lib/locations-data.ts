// بيانات الدول والمحافظات والمدن
// Countries, Governorates, and Cities Data

export interface Country {
  code: string
  name_ar: string
  name_en: string
}

export interface Governorate {
  id: string
  country_code: string
  name_ar: string
  name_en: string
}

export interface City {
  id: string
  governorate_id: string
  name_ar: string
  name_en: string
}

// الدول المدعومة
export const countries: Country[] = [
  { code: "EG", name_ar: "مصر", name_en: "Egypt" },
  { code: "SA", name_ar: "السعودية", name_en: "Saudi Arabia" },
  { code: "AE", name_ar: "الإمارات", name_en: "UAE" },
  { code: "KW", name_ar: "الكويت", name_en: "Kuwait" },
  { code: "QA", name_ar: "قطر", name_en: "Qatar" },
  { code: "BH", name_ar: "البحرين", name_en: "Bahrain" },
  { code: "OM", name_ar: "عُمان", name_en: "Oman" },
  { code: "JO", name_ar: "الأردن", name_en: "Jordan" },
  { code: "LB", name_ar: "لبنان", name_en: "Lebanon" },
  { code: "IQ", name_ar: "العراق", name_en: "Iraq" },
  { code: "SY", name_ar: "سوريا", name_en: "Syria" },
  { code: "PS", name_ar: "فلسطين", name_en: "Palestine" },
  { code: "YE", name_ar: "اليمن", name_en: "Yemen" },
  { code: "LY", name_ar: "ليبيا", name_en: "Libya" },
  { code: "TN", name_ar: "تونس", name_en: "Tunisia" },
  { code: "DZ", name_ar: "الجزائر", name_en: "Algeria" },
  { code: "MA", name_ar: "المغرب", name_en: "Morocco" },
  { code: "SD", name_ar: "السودان", name_en: "Sudan" },
]

// المحافظات المصرية
export const governorates: Governorate[] = [
  { id: "eg_cairo", country_code: "EG", name_ar: "القاهرة", name_en: "Cairo" },
  { id: "eg_giza", country_code: "EG", name_ar: "الجيزة", name_en: "Giza" },
  { id: "eg_alex", country_code: "EG", name_ar: "الإسكندرية", name_en: "Alexandria" },
  { id: "eg_qaliubiya", country_code: "EG", name_ar: "القليوبية", name_en: "Qalyubia" },
  { id: "eg_sharqia", country_code: "EG", name_ar: "الشرقية", name_en: "Sharqia" },
  { id: "eg_dakahlia", country_code: "EG", name_ar: "الدقهلية", name_en: "Dakahlia" },
  { id: "eg_gharbia", country_code: "EG", name_ar: "الغربية", name_en: "Gharbia" },
  { id: "eg_monufia", country_code: "EG", name_ar: "المنوفية", name_en: "Monufia" },
  { id: "eg_beheira", country_code: "EG", name_ar: "البحيرة", name_en: "Beheira" },
  { id: "eg_kafr_elsheikh", country_code: "EG", name_ar: "كفر الشيخ", name_en: "Kafr El Sheikh" },
  { id: "eg_damietta", country_code: "EG", name_ar: "دمياط", name_en: "Damietta" },
  { id: "eg_port_said", country_code: "EG", name_ar: "بورسعيد", name_en: "Port Said" },
  { id: "eg_ismailia", country_code: "EG", name_ar: "الإسماعيلية", name_en: "Ismailia" },
  { id: "eg_suez", country_code: "EG", name_ar: "السويس", name_en: "Suez" },
  { id: "eg_north_sinai", country_code: "EG", name_ar: "شمال سيناء", name_en: "North Sinai" },
  { id: "eg_south_sinai", country_code: "EG", name_ar: "جنوب سيناء", name_en: "South Sinai" },
  { id: "eg_fayoum", country_code: "EG", name_ar: "الفيوم", name_en: "Fayoum" },
  { id: "eg_beni_suef", country_code: "EG", name_ar: "بني سويف", name_en: "Beni Suef" },
  { id: "eg_minya", country_code: "EG", name_ar: "المنيا", name_en: "Minya" },
  { id: "eg_asyut", country_code: "EG", name_ar: "أسيوط", name_en: "Asyut" },
  { id: "eg_sohag", country_code: "EG", name_ar: "سوهاج", name_en: "Sohag" },
  { id: "eg_qena", country_code: "EG", name_ar: "قنا", name_en: "Qena" },
  { id: "eg_luxor", country_code: "EG", name_ar: "الأقصر", name_en: "Luxor" },
  { id: "eg_aswan", country_code: "EG", name_ar: "أسوان", name_en: "Aswan" },
  { id: "eg_red_sea", country_code: "EG", name_ar: "البحر الأحمر", name_en: "Red Sea" },
  { id: "eg_new_valley", country_code: "EG", name_ar: "الوادي الجديد", name_en: "New Valley" },
  { id: "eg_matrouh", country_code: "EG", name_ar: "مطروح", name_en: "Matrouh" },
]

// المدن والمراكز المصرية (شاملة لجميع المراكز الرسمية)
export const cities: City[] = [
  // ==================== القاهرة (أحياء ومناطق) ====================
  { id: "cairo_nasr_city", governorate_id: "eg_cairo", name_ar: "مدينة نصر", name_en: "Nasr City" },
  { id: "cairo_heliopolis", governorate_id: "eg_cairo", name_ar: "مصر الجديدة", name_en: "Heliopolis" },
  { id: "cairo_maadi", governorate_id: "eg_cairo", name_ar: "المعادي", name_en: "Maadi" },
  { id: "cairo_shubra", governorate_id: "eg_cairo", name_ar: "شبرا", name_en: "Shubra" },
  { id: "cairo_downtown", governorate_id: "eg_cairo", name_ar: "وسط البلد", name_en: "Downtown" },
  { id: "cairo_new_cairo", governorate_id: "eg_cairo", name_ar: "القاهرة الجديدة", name_en: "New Cairo" },
  { id: "cairo_zamalek", governorate_id: "eg_cairo", name_ar: "الزمالك", name_en: "Zamalek" },
  { id: "cairo_mokattam", governorate_id: "eg_cairo", name_ar: "المقطم", name_en: "Mokattam" },
  { id: "cairo_ain_shams", governorate_id: "eg_cairo", name_ar: "عين شمس", name_en: "Ain Shams" },
  { id: "cairo_matareya", governorate_id: "eg_cairo", name_ar: "المطرية", name_en: "Matareya" },
  { id: "cairo_hadayek_kobba", governorate_id: "eg_cairo", name_ar: "حدائق القبة", name_en: "Hadayek El Kobba" },
  { id: "cairo_zeitoun", governorate_id: "eg_cairo", name_ar: "الزيتون", name_en: "Zeitoun" },
  { id: "cairo_hadayek_maadi", governorate_id: "eg_cairo", name_ar: "حدائق المعادي", name_en: "Hadayek El Maadi" },
  { id: "cairo_dar_el_salam", governorate_id: "eg_cairo", name_ar: "دار السلام", name_en: "Dar El Salam" },
  { id: "cairo_basatin", governorate_id: "eg_cairo", name_ar: "البساتين", name_en: "Basatin" },
  { id: "cairo_helwan", governorate_id: "eg_cairo", name_ar: "حلوان", name_en: "Helwan" },
  { id: "cairo_15_may", governorate_id: "eg_cairo", name_ar: "15 مايو", name_en: "15th of May" },
  { id: "cairo_tebbin", governorate_id: "eg_cairo", name_ar: "التبين", name_en: "Tebbin" },
  { id: "cairo_old_cairo", governorate_id: "eg_cairo", name_ar: "مصر القديمة", name_en: "Old Cairo" },
  { id: "cairo_sayeda_zeinab", governorate_id: "eg_cairo", name_ar: "السيدة زينب", name_en: "Sayeda Zeinab" },
  { id: "cairo_abdeen", governorate_id: "eg_cairo", name_ar: "عابدين", name_en: "Abdeen" },
  { id: "cairo_garden_city", governorate_id: "eg_cairo", name_ar: "جاردن سيتي", name_en: "Garden City" },
  { id: "cairo_nozha", governorate_id: "eg_cairo", name_ar: "النزهة", name_en: "Nozha" },
  { id: "cairo_sheraton", governorate_id: "eg_cairo", name_ar: "شيراتون", name_en: "Sheraton" },
  { id: "cairo_gesr_el_suez", governorate_id: "eg_cairo", name_ar: "جسر السويس", name_en: "Gesr El Suez" },
  { id: "cairo_obour_city", governorate_id: "eg_cairo", name_ar: "مدينة العبور", name_en: "Obour City" },
  { id: "cairo_shorouk", governorate_id: "eg_cairo", name_ar: "الشروق", name_en: "Shorouk City" },
  { id: "cairo_badr", governorate_id: "eg_cairo", name_ar: "مدينة بدر", name_en: "Badr City" },
  { id: "cairo_rehab", governorate_id: "eg_cairo", name_ar: "الرحاب", name_en: "Rehab City" },
  { id: "cairo_fifth_settlement", governorate_id: "eg_cairo", name_ar: "التجمع الخامس", name_en: "Fifth Settlement" },
  { id: "cairo_first_settlement", governorate_id: "eg_cairo", name_ar: "التجمع الأول", name_en: "First Settlement" },
  { id: "cairo_madinaty", governorate_id: "eg_cairo", name_ar: "مدينتي", name_en: "Madinaty" },
  { id: "cairo_mostakbal", governorate_id: "eg_cairo", name_ar: "المستقبل", name_en: "Mostakbal City" },
  { id: "cairo_new_heliopolis", governorate_id: "eg_cairo", name_ar: "هليوبوليس الجديدة", name_en: "New Heliopolis" },
  { id: "cairo_new_admin_capital", governorate_id: "eg_cairo", name_ar: "العاصمة الإدارية الجديدة", name_en: "New Administrative Capital" },

  // ==================== الجيزة (مراكز وأحياء) ====================
  { id: "giza_dokki", governorate_id: "eg_giza", name_ar: "الدقي", name_en: "Dokki" },
  { id: "giza_mohandessin", governorate_id: "eg_giza", name_ar: "المهندسين", name_en: "Mohandessin" },
  { id: "giza_agouza", governorate_id: "eg_giza", name_ar: "العجوزة", name_en: "Agouza" },
  { id: "giza_haram", governorate_id: "eg_giza", name_ar: "الهرم", name_en: "Haram" },
  { id: "giza_faisal", governorate_id: "eg_giza", name_ar: "فيصل", name_en: "Faisal" },
  { id: "giza_6october", governorate_id: "eg_giza", name_ar: "السادس من أكتوبر", name_en: "6th of October" },
  { id: "giza_sheikh_zayed", governorate_id: "eg_giza", name_ar: "الشيخ زايد", name_en: "Sheikh Zayed" },
  { id: "giza_imbaba", governorate_id: "eg_giza", name_ar: "إمبابة", name_en: "Imbaba" },
  { id: "giza_boulaq", governorate_id: "eg_giza", name_ar: "بولاق الدكرور", name_en: "Boulaq Dakrour" },
  { id: "giza_omraniya", governorate_id: "eg_giza", name_ar: "العمرانية", name_en: "Omraniya" },
  { id: "giza_warraq", governorate_id: "eg_giza", name_ar: "الوراق", name_en: "Warraq" },
  { id: "giza_hadayek_october", governorate_id: "eg_giza", name_ar: "حدائق أكتوبر", name_en: "Hadayek October" },
  { id: "giza_smart_village", governorate_id: "eg_giza", name_ar: "القرية الذكية", name_en: "Smart Village" },
  { id: "giza_badrashin", governorate_id: "eg_giza", name_ar: "البدرشين", name_en: "Badrashin" },
  { id: "giza_saf", governorate_id: "eg_giza", name_ar: "الصف", name_en: "Saf" },
  { id: "giza_atfih", governorate_id: "eg_giza", name_ar: "أطفيح", name_en: "Atfih" },
  { id: "giza_ayat", governorate_id: "eg_giza", name_ar: "العياط", name_en: "Ayat" },
  { id: "giza_hawamdia", governorate_id: "eg_giza", name_ar: "الحوامدية", name_en: "Hawamdia" },
  { id: "giza_abu_nomros", governorate_id: "eg_giza", name_ar: "أبو النمرس", name_en: "Abu Nomros" },
  { id: "giza_kerdasa", governorate_id: "eg_giza", name_ar: "كرداسة", name_en: "Kerdasa" },
  { id: "giza_oseem", governorate_id: "eg_giza", name_ar: "أوسيم", name_en: "Oseem" },
  { id: "giza_manshiyet_kandil", governorate_id: "eg_giza", name_ar: "منشأة القناطر", name_en: "Manshiyet El Qanater" },
  { id: "giza_sphinx", governorate_id: "eg_giza", name_ar: "سفينكس الجديدة", name_en: "New Sphinx" },
  { id: "giza_dreamland", governorate_id: "eg_giza", name_ar: "دريم لاند", name_en: "Dreamland" },
  { id: "giza_beverly_hills", governorate_id: "eg_giza", name_ar: "بيفرلي هيلز", name_en: "Beverly Hills" },

  // ==================== الإسكندرية (أحياء وأقسام) ====================
  { id: "alex_montaza", governorate_id: "eg_alex", name_ar: "المنتزه", name_en: "Montaza" },
  { id: "alex_sidi_gaber", governorate_id: "eg_alex", name_ar: "سيدي جابر", name_en: "Sidi Gaber" },
  { id: "alex_smouha", governorate_id: "eg_alex", name_ar: "سموحة", name_en: "Smouha" },
  { id: "alex_san_stefano", governorate_id: "eg_alex", name_ar: "سان ستيفانو", name_en: "San Stefano" },
  { id: "alex_miami", governorate_id: "eg_alex", name_ar: "ميامي", name_en: "Miami" },
  { id: "alex_mamoura", governorate_id: "eg_alex", name_ar: "المعمورة", name_en: "Mamoura" },
  { id: "alex_borg_el_arab", governorate_id: "eg_alex", name_ar: "برج العرب", name_en: "Borg El Arab" },
  { id: "alex_new_borg_el_arab", governorate_id: "eg_alex", name_ar: "برج العرب الجديدة", name_en: "New Borg El Arab" },
  { id: "alex_agami", governorate_id: "eg_alex", name_ar: "العجمي", name_en: "Agami" },
  { id: "alex_bitash", governorate_id: "eg_alex", name_ar: "البيطاش", name_en: "Bitash" },
  { id: "alex_hannoville", governorate_id: "eg_alex", name_ar: "هانوفيل", name_en: "Hannoville" },
  { id: "alex_dekheila", governorate_id: "eg_alex", name_ar: "الدخيلة", name_en: "Dekheila" },
  { id: "alex_amreya", governorate_id: "eg_alex", name_ar: "العامرية", name_en: "Amreya" },
  { id: "alex_karmouz", governorate_id: "eg_alex", name_ar: "كرموز", name_en: "Karmouz" },
  { id: "alex_mina_el_basal", governorate_id: "eg_alex", name_ar: "مينا البصل", name_en: "Mina El Basal" },
  { id: "alex_labban", governorate_id: "eg_alex", name_ar: "اللبان", name_en: "Labban" },
  { id: "alex_moharam_bek", governorate_id: "eg_alex", name_ar: "محرم بك", name_en: "Moharam Bek" },
  { id: "alex_attarin", governorate_id: "eg_alex", name_ar: "العطارين", name_en: "Attarin" },
  { id: "alex_mansheya", governorate_id: "eg_alex", name_ar: "المنشية", name_en: "Mansheya" },
  { id: "alex_gomrok", governorate_id: "eg_alex", name_ar: "الجمرك", name_en: "Gomrok" },
  { id: "alex_raml_station", governorate_id: "eg_alex", name_ar: "محطة الرمل", name_en: "Raml Station" },
  { id: "alex_gleem", governorate_id: "eg_alex", name_ar: "جليم", name_en: "Gleem" },
  { id: "alex_camp_cesar", governorate_id: "eg_alex", name_ar: "كامب شيزار", name_en: "Camp Cesar" },
  { id: "alex_cleopatra", governorate_id: "eg_alex", name_ar: "كليوباترا", name_en: "Cleopatra" },
  { id: "alex_sporting", governorate_id: "eg_alex", name_ar: "سبورتنج", name_en: "Sporting" },
  { id: "alex_fleming", governorate_id: "eg_alex", name_ar: "فليمنج", name_en: "Fleming" },
  { id: "alex_roushdy", governorate_id: "eg_alex", name_ar: "رشدي", name_en: "Roushdy" },
  { id: "alex_stanley", governorate_id: "eg_alex", name_ar: "ستانلي", name_en: "Stanley" },
  { id: "alex_louran", governorate_id: "eg_alex", name_ar: "لوران", name_en: "Louran" },
  { id: "alex_ibrahimia", governorate_id: "eg_alex", name_ar: "الإبراهيمية", name_en: "Ibrahimia" },
  { id: "alex_sidi_bishr", governorate_id: "eg_alex", name_ar: "سيدي بشر", name_en: "Sidi Bishr" },
  { id: "alex_mandara", governorate_id: "eg_alex", name_ar: "المندرة", name_en: "Mandara" },
  { id: "alex_asafra", governorate_id: "eg_alex", name_ar: "العصافرة", name_en: "Asafra" },
  { id: "alex_abu_qir", governorate_id: "eg_alex", name_ar: "أبو قير", name_en: "Abu Qir" },

  // ==================== القليوبية (مراكز) ====================
  { id: "qaliubiya_banha", governorate_id: "eg_qaliubiya", name_ar: "بنها", name_en: "Banha" },
  { id: "qaliubiya_shubra_elkhema", governorate_id: "eg_qaliubiya", name_ar: "شبرا الخيمة", name_en: "Shubra El Khema" },
  { id: "qaliubiya_qalyub", governorate_id: "eg_qaliubiya", name_ar: "قليوب", name_en: "Qalyub" },
  { id: "qaliubiya_khanka", governorate_id: "eg_qaliubiya", name_ar: "الخانكة", name_en: "Khanka" },
  { id: "qaliubiya_obour", governorate_id: "eg_qaliubiya", name_ar: "العبور", name_en: "Obour City" },
  { id: "qaliubiya_khosous", governorate_id: "eg_qaliubiya", name_ar: "الخصوص", name_en: "Khosous" },
  { id: "qaliubiya_shibin_qanater", governorate_id: "eg_qaliubiya", name_ar: "شبين القناطر", name_en: "Shibin El Qanater" },
  { id: "qaliubiya_toukh", governorate_id: "eg_qaliubiya", name_ar: "طوخ", name_en: "Toukh" },
  { id: "qaliubiya_qaha", governorate_id: "eg_qaliubiya", name_ar: "قها", name_en: "Qaha" },
  { id: "qaliubiya_kafr_shukr", governorate_id: "eg_qaliubiya", name_ar: "كفر شكر", name_en: "Kafr Shukr" },
  { id: "qaliubiya_qanatir_kheiriya", governorate_id: "eg_qaliubiya", name_ar: "القناطر الخيرية", name_en: "Qanatir Kheiriya" },

  // ==================== الشرقية (مراكز) ====================
  { id: "sharqia_zagazig", governorate_id: "eg_sharqia", name_ar: "الزقازيق", name_en: "Zagazig" },
  { id: "sharqia_10th_ramadan", governorate_id: "eg_sharqia", name_ar: "العاشر من رمضان", name_en: "10th of Ramadan" },
  { id: "sharqia_bilbeis", governorate_id: "eg_sharqia", name_ar: "بلبيس", name_en: "Bilbeis" },
  { id: "sharqia_abu_hammad", governorate_id: "eg_sharqia", name_ar: "أبو حماد", name_en: "Abu Hammad" },
  { id: "sharqia_husseiniya", governorate_id: "eg_sharqia", name_ar: "الحسينية", name_en: "Husseiniya" },
  { id: "sharqia_abu_kabir", governorate_id: "eg_sharqia", name_ar: "أبو كبير", name_en: "Abu Kabir" },
  { id: "sharqia_faqous", governorate_id: "eg_sharqia", name_ar: "فاقوس", name_en: "Faqous" },
  { id: "sharqia_hihya", governorate_id: "eg_sharqia", name_ar: "ههيا", name_en: "Hihya" },
  { id: "sharqia_minia_qamh", governorate_id: "eg_sharqia", name_ar: "منيا القمح", name_en: "Minia El Qamh" },
  { id: "sharqia_ibrahimiya", governorate_id: "eg_sharqia", name_ar: "الإبراهيمية", name_en: "Ibrahimiya" },
  { id: "sharqia_derab_negm", governorate_id: "eg_sharqia", name_ar: "ديرب نجم", name_en: "Derab Negm" },
  { id: "sharqia_kafr_saqr", governorate_id: "eg_sharqia", name_ar: "كفر صقر", name_en: "Kafr Saqr" },
  { id: "sharqia_awlad_saqr", governorate_id: "eg_sharqia", name_ar: "أولاد صقر", name_en: "Awlad Saqr" },
  { id: "sharqia_mashtoul", governorate_id: "eg_sharqia", name_ar: "مشتول السوق", name_en: "Mashtoul El Souq" },
  { id: "sharqia_qurein", governorate_id: "eg_sharqia", name_ar: "القرين", name_en: "Qurein" },
  { id: "sharqia_salhia_gedida", governorate_id: "eg_sharqia", name_ar: "الصالحية الجديدة", name_en: "Salhia Gedida" },
  { id: "sharqia_qenayat", governorate_id: "eg_sharqia", name_ar: "القنايات", name_en: "Qenayat" },

  // ==================== الدقهلية (مراكز) ====================
  { id: "dakahlia_mansoura", governorate_id: "eg_dakahlia", name_ar: "المنصورة", name_en: "Mansoura" },
  { id: "dakahlia_talkha", governorate_id: "eg_dakahlia", name_ar: "طلخا", name_en: "Talkha" },
  { id: "dakahlia_mit_ghamr", governorate_id: "eg_dakahlia", name_ar: "ميت غمر", name_en: "Mit Ghamr" },
  { id: "dakahlia_dekernes", governorate_id: "eg_dakahlia", name_ar: "دكرنس", name_en: "Dekernes" },
  { id: "dakahlia_sherbin", governorate_id: "eg_dakahlia", name_ar: "شربين", name_en: "Sherbin" },
  { id: "dakahlia_bilqas", governorate_id: "eg_dakahlia", name_ar: "بلقاس", name_en: "Bilqas" },
  { id: "dakahlia_aga", governorate_id: "eg_dakahlia", name_ar: "أجا", name_en: "Aga" },
  { id: "dakahlia_sinbillawein", governorate_id: "eg_dakahlia", name_ar: "السنبلاوين", name_en: "Sinbillawein" },
  { id: "dakahlia_manzala", governorate_id: "eg_dakahlia", name_ar: "المنزلة", name_en: "Manzala" },
  { id: "dakahlia_matareya", governorate_id: "eg_dakahlia", name_ar: "المطرية", name_en: "Matareya" },
  { id: "dakahlia_gammaliya", governorate_id: "eg_dakahlia", name_ar: "الجمالية", name_en: "Gammaliya" },
  { id: "dakahlia_bani_ebeid", governorate_id: "eg_dakahlia", name_ar: "بني عبيد", name_en: "Bani Ebeid" },
  { id: "dakahlia_mit_salsil", governorate_id: "eg_dakahlia", name_ar: "ميت سلسيل", name_en: "Mit Salsil" },
  { id: "dakahlia_nabroh", governorate_id: "eg_dakahlia", name_ar: "نبروه", name_en: "Nabroh" },
  { id: "dakahlia_minyat_nasr", governorate_id: "eg_dakahlia", name_ar: "منية النصر", name_en: "Minyat El Nasr" },
  { id: "dakahlia_tami_amdid", governorate_id: "eg_dakahlia", name_ar: "تمي الأمديد", name_en: "Tami El Amdid" },
  { id: "dakahlia_gamasa", governorate_id: "eg_dakahlia", name_ar: "جمصة", name_en: "Gamasa" },
  { id: "dakahlia_new_mansoura", governorate_id: "eg_dakahlia", name_ar: "المنصورة الجديدة", name_en: "New Mansoura" },

  // ==================== الغربية (مراكز) ====================
  { id: "gharbia_tanta", governorate_id: "eg_gharbia", name_ar: "طنطا", name_en: "Tanta" },
  { id: "gharbia_mahalla", governorate_id: "eg_gharbia", name_ar: "المحلة الكبرى", name_en: "Mahalla El Kubra" },
  { id: "gharbia_kafr_el_zayat", governorate_id: "eg_gharbia", name_ar: "كفر الزيات", name_en: "Kafr El Zayat" },
  { id: "gharbia_zefta", governorate_id: "eg_gharbia", name_ar: "زفتى", name_en: "Zefta" },
  { id: "gharbia_santa", governorate_id: "eg_gharbia", name_ar: "السنطة", name_en: "Santa" },
  { id: "gharbia_samanoud", governorate_id: "eg_gharbia", name_ar: "سمنود", name_en: "Samanoud" },
  { id: "gharbia_kotour", governorate_id: "eg_gharbia", name_ar: "قطور", name_en: "Kotour" },
  { id: "gharbia_basyoun", governorate_id: "eg_gharbia", name_ar: "بسيون", name_en: "Basyoun" },

  // ==================== المنوفية (مراكز) ====================
  { id: "monufia_shibin", governorate_id: "eg_monufia", name_ar: "شبين الكوم", name_en: "Shibin El Kom" },
  { id: "monufia_menouf", governorate_id: "eg_monufia", name_ar: "منوف", name_en: "Menouf" },
  { id: "monufia_sadat_city", governorate_id: "eg_monufia", name_ar: "مدينة السادات", name_en: "Sadat City" },
  { id: "monufia_ashmoun", governorate_id: "eg_monufia", name_ar: "أشمون", name_en: "Ashmoun" },
  { id: "monufia_bagour", governorate_id: "eg_monufia", name_ar: "الباجور", name_en: "Bagour" },
  { id: "monufia_quesna", governorate_id: "eg_monufia", name_ar: "قويسنا", name_en: "Quesna" },
  { id: "monufia_berket_sab", governorate_id: "eg_monufia", name_ar: "بركة السبع", name_en: "Berket El Sab" },
  { id: "monufia_tala", governorate_id: "eg_monufia", name_ar: "تلا", name_en: "Tala" },
  { id: "monufia_shohadaa", governorate_id: "eg_monufia", name_ar: "الشهداء", name_en: "Shohadaa" },
  { id: "monufia_sers_el_layan", governorate_id: "eg_monufia", name_ar: "سرس الليان", name_en: "Sers El Layan" },

  // ==================== البحيرة (مراكز) ====================
  { id: "beheira_damanhur", governorate_id: "eg_beheira", name_ar: "دمنهور", name_en: "Damanhur" },
  { id: "beheira_kafr_dawwar", governorate_id: "eg_beheira", name_ar: "كفر الدوار", name_en: "Kafr Dawwar" },
  { id: "beheira_rashid", governorate_id: "eg_beheira", name_ar: "رشيد", name_en: "Rashid" },
  { id: "beheira_edko", governorate_id: "eg_beheira", name_ar: "إدكو", name_en: "Edko" },
  { id: "beheira_abu_homs", governorate_id: "eg_beheira", name_ar: "أبو حمص", name_en: "Abu Homs" },
  { id: "beheira_delengat", governorate_id: "eg_beheira", name_ar: "الدلنجات", name_en: "Delengat" },
  { id: "beheira_mahmoudia", governorate_id: "eg_beheira", name_ar: "المحمودية", name_en: "Mahmoudia" },
  { id: "beheira_rahmaniya", governorate_id: "eg_beheira", name_ar: "الرحمانية", name_en: "Rahmaniya" },
  { id: "beheira_itay_baroud", governorate_id: "eg_beheira", name_ar: "إيتاي البارود", name_en: "Itay El Baroud" },
  { id: "beheira_housh_issa", governorate_id: "eg_beheira", name_ar: "حوش عيسى", name_en: "Housh Issa" },
  { id: "beheira_shubrakhit", governorate_id: "eg_beheira", name_ar: "شبراخيت", name_en: "Shubrakhit" },
  { id: "beheira_kom_hamada", governorate_id: "eg_beheira", name_ar: "كوم حمادة", name_en: "Kom Hamada" },
  { id: "beheira_abu_matamir", governorate_id: "eg_beheira", name_ar: "أبو المطامير", name_en: "Abu El Matamir" },
  { id: "beheira_wadi_natroun", governorate_id: "eg_beheira", name_ar: "وادي النطرون", name_en: "Wadi Natroun" },
  { id: "beheira_nubaria", governorate_id: "eg_beheira", name_ar: "النوبارية الجديدة", name_en: "New Nubaria" },
  { id: "beheira_badr", governorate_id: "eg_beheira", name_ar: "بدر", name_en: "Badr" },

  // ==================== كفر الشيخ (مراكز) ====================
  { id: "kafr_elsheikh_city", governorate_id: "eg_kafr_elsheikh", name_ar: "كفر الشيخ", name_en: "Kafr El Sheikh" },
  { id: "kafr_elsheikh_desouk", governorate_id: "eg_kafr_elsheikh", name_ar: "دسوق", name_en: "Desouk" },
  { id: "kafr_elsheikh_fowa", governorate_id: "eg_kafr_elsheikh", name_ar: "فوه", name_en: "Fowa" },
  { id: "kafr_elsheikh_metobas", governorate_id: "eg_kafr_elsheikh", name_ar: "مطوبس", name_en: "Metobas" },
  { id: "kafr_elsheikh_baltim", governorate_id: "eg_kafr_elsheikh", name_ar: "بلطيم", name_en: "Baltim" },
  { id: "kafr_elsheikh_burullus", governorate_id: "eg_kafr_elsheikh", name_ar: "البرلس", name_en: "Burullus" },
  { id: "kafr_elsheikh_sidi_salem", governorate_id: "eg_kafr_elsheikh", name_ar: "سيدي سالم", name_en: "Sidi Salem" },
  { id: "kafr_elsheikh_reyad", governorate_id: "eg_kafr_elsheikh", name_ar: "الرياض", name_en: "Reyad" },
  { id: "kafr_elsheikh_qaleen", governorate_id: "eg_kafr_elsheikh", name_ar: "قلين", name_en: "Qaleen" },
  { id: "kafr_elsheikh_biala", governorate_id: "eg_kafr_elsheikh", name_ar: "بيلا", name_en: "Biala" },
  { id: "kafr_elsheikh_hamoul", governorate_id: "eg_kafr_elsheikh", name_ar: "الحامول", name_en: "Hamoul" },

  // ==================== دمياط (مراكز) ====================
  { id: "damietta_city", governorate_id: "eg_damietta", name_ar: "دمياط", name_en: "Damietta" },
  { id: "damietta_new", governorate_id: "eg_damietta", name_ar: "دمياط الجديدة", name_en: "New Damietta" },
  { id: "damietta_ras_el_bar", governorate_id: "eg_damietta", name_ar: "رأس البر", name_en: "Ras El Bar" },
  { id: "damietta_faraskour", governorate_id: "eg_damietta", name_ar: "فارسكور", name_en: "Faraskour" },
  { id: "damietta_zarqa", governorate_id: "eg_damietta", name_ar: "الزرقا", name_en: "Zarqa" },
  { id: "damietta_kafr_saad", governorate_id: "eg_damietta", name_ar: "كفر سعد", name_en: "Kafr Saad" },
  { id: "damietta_kafr_batikh", governorate_id: "eg_damietta", name_ar: "كفر البطيخ", name_en: "Kafr El Batikh" },

  // ==================== بورسعيد (أحياء) ====================
  { id: "port_said_sharq", governorate_id: "eg_port_said", name_ar: "حي الشرق", name_en: "Sharq District" },
  { id: "port_said_arab", governorate_id: "eg_port_said", name_ar: "حي العرب", name_en: "Arab District" },
  { id: "port_said_manakh", governorate_id: "eg_port_said", name_ar: "حي المناخ", name_en: "Manakh District" },
  { id: "port_said_zohor", governorate_id: "eg_port_said", name_ar: "حي الزهور", name_en: "Zohor District" },
  { id: "port_said_dawahi", governorate_id: "eg_port_said", name_ar: "حي الضواحي", name_en: "Dawahi District" },
  { id: "port_said_ganub", governorate_id: "eg_port_said", name_ar: "حي الجنوب", name_en: "Ganub District" },
  { id: "port_said_fuad", governorate_id: "eg_port_said", name_ar: "بورفؤاد", name_en: "Port Fuad" },

  // ==================== الإسماعيلية (مراكز) ====================
  { id: "ismailia_city", governorate_id: "eg_ismailia", name_ar: "الإسماعيلية", name_en: "Ismailia" },
  { id: "ismailia_fayed", governorate_id: "eg_ismailia", name_ar: "فايد", name_en: "Fayed" },
  { id: "ismailia_qantara_sharq", governorate_id: "eg_ismailia", name_ar: "القنطرة شرق", name_en: "Qantara Sharq" },
  { id: "ismailia_qantara_gharb", governorate_id: "eg_ismailia", name_ar: "القنطرة غرب", name_en: "Qantara Gharb" },
  { id: "ismailia_tal_kebir", governorate_id: "eg_ismailia", name_ar: "التل الكبير", name_en: "Tal El Kebir" },
  { id: "ismailia_abu_sawir", governorate_id: "eg_ismailia", name_ar: "أبو صوير", name_en: "Abu Sawir" },
  { id: "ismailia_qasasin", governorate_id: "eg_ismailia", name_ar: "القصاصين", name_en: "Qasasin" },

  // ==================== السويس (أحياء) ====================
  { id: "suez_city", governorate_id: "eg_suez", name_ar: "السويس", name_en: "Suez" },
  { id: "suez_arbaeen", governorate_id: "eg_suez", name_ar: "حي الأربعين", name_en: "Arbaeen District" },
  { id: "suez_suez", governorate_id: "eg_suez", name_ar: "حي السويس", name_en: "Suez District" },
  { id: "suez_ganayen", governorate_id: "eg_suez", name_ar: "حي الجناين", name_en: "Ganayen District" },
  { id: "suez_ataka", governorate_id: "eg_suez", name_ar: "عتاقة", name_en: "Ataka" },
  { id: "suez_faisal", governorate_id: "eg_suez", name_ar: "حي فيصل", name_en: "Faisal District" },

  // ==================== شمال سيناء (مراكز) ====================
  { id: "north_sinai_arish", governorate_id: "eg_north_sinai", name_ar: "العريش", name_en: "Arish" },
  { id: "north_sinai_rafah", governorate_id: "eg_north_sinai", name_ar: "رفح", name_en: "Rafah" },
  { id: "north_sinai_sheikh_zweid", governorate_id: "eg_north_sinai", name_ar: "الشيخ زويد", name_en: "Sheikh Zweid" },
  { id: "north_sinai_bir_abd", governorate_id: "eg_north_sinai", name_ar: "بئر العبد", name_en: "Bir El Abd" },
  { id: "north_sinai_hasana", governorate_id: "eg_north_sinai", name_ar: "الحسنة", name_en: "Hasana" },
  { id: "north_sinai_nakhl", governorate_id: "eg_north_sinai", name_ar: "نخل", name_en: "Nakhl" },

  // ==================== جنوب سيناء (مراكز) ====================
  { id: "south_sinai_sharm", governorate_id: "eg_south_sinai", name_ar: "شرم الشيخ", name_en: "Sharm El Sheikh" },
  { id: "south_sinai_dahab", governorate_id: "eg_south_sinai", name_ar: "دهب", name_en: "Dahab" },
  { id: "south_sinai_nuweiba", governorate_id: "eg_south_sinai", name_ar: "نويبع", name_en: "Nuweiba" },
  { id: "south_sinai_taba", governorate_id: "eg_south_sinai", name_ar: "طابا", name_en: "Taba" },
  { id: "south_sinai_tur", governorate_id: "eg_south_sinai", name_ar: "الطور", name_en: "Tur" },
  { id: "south_sinai_saint_catherine", governorate_id: "eg_south_sinai", name_ar: "سانت كاترين", name_en: "Saint Catherine" },
  { id: "south_sinai_abu_zenima", governorate_id: "eg_south_sinai", name_ar: "أبو زنيمة", name_en: "Abu Zenima" },
  { id: "south_sinai_abu_redis", governorate_id: "eg_south_sinai", name_ar: "أبو رديس", name_en: "Abu Redis" },
  { id: "south_sinai_ras_sidr", governorate_id: "eg_south_sinai", name_ar: "رأس سدر", name_en: "Ras Sidr" },

  // ==================== الفيوم (مراكز) ====================
  { id: "fayoum_city", governorate_id: "eg_fayoum", name_ar: "الفيوم", name_en: "Fayoum" },
  { id: "fayoum_tamiya", governorate_id: "eg_fayoum", name_ar: "طامية", name_en: "Tamiya" },
  { id: "fayoum_snores", governorate_id: "eg_fayoum", name_ar: "سنورس", name_en: "Snores" },
  { id: "fayoum_ibsheway", governorate_id: "eg_fayoum", name_ar: "إبشواي", name_en: "Ibsheway" },
  { id: "fayoum_itsa", governorate_id: "eg_fayoum", name_ar: "إطسا", name_en: "Itsa" },
  { id: "fayoum_youssef_siddiq", governorate_id: "eg_fayoum", name_ar: "يوسف الصديق", name_en: "Youssef El Siddiq" },

  // ==================== بني سويف (مراكز) ====================
  { id: "beni_suef_city", governorate_id: "eg_beni_suef", name_ar: "بني سويف", name_en: "Beni Suef" },
  { id: "beni_suef_beba", governorate_id: "eg_beni_suef", name_ar: "ببا", name_en: "Beba" },
  { id: "beni_suef_fashn", governorate_id: "eg_beni_suef", name_ar: "الفشن", name_en: "Fashn" },
  { id: "beni_suef_wasta", governorate_id: "eg_beni_suef", name_ar: "الواسطى", name_en: "Wasta" },
  { id: "beni_suef_nasser", governorate_id: "eg_beni_suef", name_ar: "ناصر", name_en: "Nasser" },
  { id: "beni_suef_ihnasya", governorate_id: "eg_beni_suef", name_ar: "إهناسيا", name_en: "Ihnasya" },
  { id: "beni_suef_somosta", governorate_id: "eg_beni_suef", name_ar: "سمسطا", name_en: "Somosta" },
  { id: "beni_suef_new_beni_suef", governorate_id: "eg_beni_suef", name_ar: "بني سويف الجديدة", name_en: "New Beni Suef" },

  // ==================== المنيا (مراكز) ====================
  { id: "minya_city", governorate_id: "eg_minya", name_ar: "المنيا", name_en: "Minya" },
  { id: "minya_magagha", governorate_id: "eg_minya", name_ar: "مغاغة", name_en: "Magagha" },
  { id: "minya_bani_mazar", governorate_id: "eg_minya", name_ar: "بني مزار", name_en: "Bani Mazar" },
  { id: "minya_mattay", governorate_id: "eg_minya", name_ar: "مطاي", name_en: "Mattay" },
  { id: "minya_samalout", governorate_id: "eg_minya", name_ar: "سمالوط", name_en: "Samalout" },
  { id: "minya_edwa", governorate_id: "eg_minya", name_ar: "العدوة", name_en: "Edwa" },
  { id: "minya_mallawi", governorate_id: "eg_minya", name_ar: "ملوي", name_en: "Mallawi" },
  { id: "minya_deir_mawas", governorate_id: "eg_minya", name_ar: "دير مواس", name_en: "Deir Mawas" },
  { id: "minya_abu_qurqas", governorate_id: "eg_minya", name_ar: "أبو قرقاص", name_en: "Abu Qurqas" },
  { id: "minya_new_minya", governorate_id: "eg_minya", name_ar: "المنيا الجديدة", name_en: "New Minya" },

  // ==================== أسيوط (مراكز) ====================
  { id: "asyut_city", governorate_id: "eg_asyut", name_ar: "أسيوط", name_en: "Asyut" },
  { id: "asyut_dayrout", governorate_id: "eg_asyut", name_ar: "ديروط", name_en: "Dayrout" },
  { id: "asyut_manfalout", governorate_id: "eg_asyut", name_ar: "منفلوط", name_en: "Manfalout" },
  { id: "asyut_qusiya", governorate_id: "eg_asyut", name_ar: "القوصية", name_en: "Qusiya" },
  { id: "asyut_abnub", governorate_id: "eg_asyut", name_ar: "أبنوب", name_en: "Abnub" },
  { id: "asyut_fath", governorate_id: "eg_asyut", name_ar: "الفتح", name_en: "Fath" },
  { id: "asyut_sahel_selim", governorate_id: "eg_asyut", name_ar: "ساحل سليم", name_en: "Sahel Selim" },
  { id: "asyut_badari", governorate_id: "eg_asyut", name_ar: "البداري", name_en: "Badari" },
  { id: "asyut_sidfa", governorate_id: "eg_asyut", name_ar: "صدفا", name_en: "Sidfa" },
  { id: "asyut_ghanayem", governorate_id: "eg_asyut", name_ar: "الغنايم", name_en: "Ghanayem" },
  { id: "asyut_abou_tig", governorate_id: "eg_asyut", name_ar: "أبو تيج", name_en: "Abou Tig" },
  { id: "asyut_new_asyut", governorate_id: "eg_asyut", name_ar: "أسيوط الجديدة", name_en: "New Asyut" },

  // ==================== سوهاج (مراكز) ====================
  { id: "sohag_city", governorate_id: "eg_sohag", name_ar: "سوهاج", name_en: "Sohag" },
  { id: "sohag_akhmim", governorate_id: "eg_sohag", name_ar: "أخميم", name_en: "Akhmim" },
  { id: "sohag_tahta", governorate_id: "eg_sohag", name_ar: "طهطا", name_en: "Tahta" },
  { id: "sohag_girga", governorate_id: "eg_sohag", name_ar: "جرجا", name_en: "Girga" },
  { id: "sohag_balyana", governorate_id: "eg_sohag", name_ar: "البلينا", name_en: "Balyana" },
  { id: "sohag_maragha", governorate_id: "eg_sohag", name_ar: "المراغة", name_en: "Maragha" },
  { id: "sohag_monshaat", governorate_id: "eg_sohag", name_ar: "المنشاة", name_en: "Monshaat" },
  { id: "sohag_saqultah", governorate_id: "eg_sohag", name_ar: "ساقلتة", name_en: "Saqultah" },
  { id: "sohag_tama", governorate_id: "eg_sohag", name_ar: "طما", name_en: "Tama" },
  { id: "sohag_juhayna", governorate_id: "eg_sohag", name_ar: "جهينة", name_en: "Juhayna" },
  { id: "sohag_dar_salam", governorate_id: "eg_sohag", name_ar: "دار السلام", name_en: "Dar El Salam" },
  { id: "sohag_new_sohag", governorate_id: "eg_sohag", name_ar: "سوهاج الجديدة", name_en: "New Sohag" },

  // ==================== قنا (مراكز) ====================
  { id: "qena_city", governorate_id: "eg_qena", name_ar: "قنا", name_en: "Qena" },
  { id: "qena_qous", governorate_id: "eg_qena", name_ar: "قوص", name_en: "Qous" },
  { id: "qena_nag_hammadi", governorate_id: "eg_qena", name_ar: "نجع حمادي", name_en: "Nag Hammadi" },
  { id: "qena_deshna", governorate_id: "eg_qena", name_ar: "دشنا", name_en: "Deshna" },
  { id: "qena_farshout", governorate_id: "eg_qena", name_ar: "فرشوط", name_en: "Farshout" },
  { id: "qena_abu_tesht", governorate_id: "eg_qena", name_ar: "أبو تشت", name_en: "Abu Tesht" },
  { id: "qena_qeft", governorate_id: "eg_qena", name_ar: "قفط", name_en: "Qeft" },
  { id: "qena_nakada", governorate_id: "eg_qena", name_ar: "نقادة", name_en: "Nakada" },
  { id: "qena_waqf", governorate_id: "eg_qena", name_ar: "الوقف", name_en: "Waqf" },
  { id: "qena_new_qena", governorate_id: "eg_qena", name_ar: "قنا الجديدة", name_en: "New Qena" },

  // ==================== الأقصر (مراكز) ====================
  { id: "luxor_city", governorate_id: "eg_luxor", name_ar: "الأقصر", name_en: "Luxor" },
  { id: "luxor_esna", governorate_id: "eg_luxor", name_ar: "إسنا", name_en: "Esna" },
  { id: "luxor_armant", governorate_id: "eg_luxor", name_ar: "أرمنت", name_en: "Armant" },
  { id: "luxor_toud", governorate_id: "eg_luxor", name_ar: "الطود", name_en: "Toud" },
  { id: "luxor_qurna", governorate_id: "eg_luxor", name_ar: "القرنة", name_en: "Qurna" },
  { id: "luxor_bayadeya", governorate_id: "eg_luxor", name_ar: "البياضية", name_en: "Bayadeya" },
  { id: "luxor_zeneya", governorate_id: "eg_luxor", name_ar: "الزينية", name_en: "Zeneya" },
  { id: "luxor_new_tiba", governorate_id: "eg_luxor", name_ar: "طيبة الجديدة", name_en: "New Tiba" },

  // ==================== أسوان (مراكز) ====================
  { id: "aswan_city", governorate_id: "eg_aswan", name_ar: "أسوان", name_en: "Aswan" },
  { id: "aswan_kom_ombo", governorate_id: "eg_aswan", name_ar: "كوم أمبو", name_en: "Kom Ombo" },
  { id: "aswan_daraw", governorate_id: "eg_aswan", name_ar: "دراو", name_en: "Daraw" },
  { id: "aswan_edfu", governorate_id: "eg_aswan", name_ar: "إدفو", name_en: "Edfu" },
  { id: "aswan_nasr_nuba", governorate_id: "eg_aswan", name_ar: "نصر النوبة", name_en: "Nasr El Nuba" },
  { id: "aswan_abu_simbel", governorate_id: "eg_aswan", name_ar: "أبو سمبل", name_en: "Abu Simbel" },
  { id: "aswan_new_aswan", governorate_id: "eg_aswan", name_ar: "أسوان الجديدة", name_en: "New Aswan" },

  // ==================== البحر الأحمر (مدن) ====================
  { id: "red_sea_hurghada", governorate_id: "eg_red_sea", name_ar: "الغردقة", name_en: "Hurghada" },
  { id: "red_sea_safaga", governorate_id: "eg_red_sea", name_ar: "سفاجا", name_en: "Safaga" },
  { id: "red_sea_quseir", governorate_id: "eg_red_sea", name_ar: "القصير", name_en: "Quseir" },
  { id: "red_sea_marsa_alam", governorate_id: "eg_red_sea", name_ar: "مرسى علم", name_en: "Marsa Alam" },
  { id: "red_sea_shalatin", governorate_id: "eg_red_sea", name_ar: "شلاتين", name_en: "Shalatin" },
  { id: "red_sea_halaib", governorate_id: "eg_red_sea", name_ar: "حلايب", name_en: "Halaib" },
  { id: "red_sea_ras_gharib", governorate_id: "eg_red_sea", name_ar: "رأس غارب", name_en: "Ras Gharib" },
  { id: "red_sea_gouna", governorate_id: "eg_red_sea", name_ar: "الجونة", name_en: "El Gouna" },
  { id: "red_sea_makadi", governorate_id: "eg_red_sea", name_ar: "مكادي", name_en: "Makadi Bay" },
  { id: "red_sea_soma_bay", governorate_id: "eg_red_sea", name_ar: "سوما باي", name_en: "Soma Bay" },

  // ==================== الوادي الجديد (مراكز) ====================
  { id: "new_valley_kharga", governorate_id: "eg_new_valley", name_ar: "الخارجة", name_en: "Kharga" },
  { id: "new_valley_dakhla", governorate_id: "eg_new_valley", name_ar: "الداخلة", name_en: "Dakhla" },
  { id: "new_valley_farafra", governorate_id: "eg_new_valley", name_ar: "الفرافرة", name_en: "Farafra" },
  { id: "new_valley_baris", governorate_id: "eg_new_valley", name_ar: "باريس", name_en: "Baris" },
  { id: "new_valley_balat", governorate_id: "eg_new_valley", name_ar: "بلاط", name_en: "Balat" },

  // ==================== مطروح (مراكز) ====================
  { id: "matrouh_city", governorate_id: "eg_matrouh", name_ar: "مرسى مطروح", name_en: "Marsa Matrouh" },
  { id: "matrouh_alamein", governorate_id: "eg_matrouh", name_ar: "العلمين", name_en: "Alamein" },
  { id: "matrouh_new_alamein", governorate_id: "eg_matrouh", name_ar: "العلمين الجديدة", name_en: "New Alamein" },
  { id: "matrouh_hamam", governorate_id: "eg_matrouh", name_ar: "الحمام", name_en: "Hamam" },
  { id: "matrouh_dabaa", governorate_id: "eg_matrouh", name_ar: "الضبعة", name_en: "Dabaa" },
  { id: "matrouh_negila", governorate_id: "eg_matrouh", name_ar: "النجيلة", name_en: "Negila" },
  { id: "matrouh_sidi_barrani", governorate_id: "eg_matrouh", name_ar: "سيدي براني", name_en: "Sidi Barrani" },
  { id: "matrouh_salloum", governorate_id: "eg_matrouh", name_ar: "السلوم", name_en: "Salloum" },
  { id: "matrouh_siwa", governorate_id: "eg_matrouh", name_ar: "سيوة", name_en: "Siwa" },
]

// دالة للحصول على المحافظات حسب الدولة
export function getGovernoratesByCountry(countryCode: string): Governorate[] {
  return governorates.filter(g => g.country_code === countryCode)
}

// دالة للحصول على المدن حسب المحافظة
export function getCitiesByGovernorate(governorateId: string): City[] {
  return cities.filter(c => c.governorate_id === governorateId)
}

