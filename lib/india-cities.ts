/**
 * lib/india-cities.ts
 * 
 * Complete India city + district/sub-area database
 * Sources: Census 2011, OpenStreetMap, Common knowledge
 * 
 * Used for:
 *  - CitySelector dropdown (all major Indian cities)
 *  - city_areas table seeding (sub-areas per city)
 *  - City feed coverage (posts from all sub-areas count for parent city)
 */

export interface CityArea {
  city: string
  state: string
  areas: string[]      // official sub-areas/localities
  aliases?: string[]   // common alternate spellings
  lat: number
  lng: number
  radiusKm: number
}

export const INDIA_CITIES: CityArea[] = [
  // ── WEST BENGAL ──────────────────────────────────────────────
  {
    city: 'Kolkata', state: 'West Bengal', lat: 22.5726, lng: 88.3639, radiusKm: 30,
    areas: [
      'Salt Lake', 'New Town', 'Jadavpur', 'Ballygunge', 'Park Street',
      'Dumdum', 'Behala', 'Tollygunge', 'Shyambazar', 'Ultadanga',
      'Kasba', 'Garia', 'Baghajatin', 'Regent Park', 'Santoshpur',
      'Gariahat', 'Golpark', 'Jodhpur Park', 'Lake Town', 'VIP Road',
      'New Alipore', 'Alipore', 'Kalighat', 'Rashbehari', 'Dhakuria',
      'Sonarpur', 'Narendrapur', 'Patuli', 'Mukundapur', 'Teghoria',
      'Barasat', 'Madhyamgram', 'Dum Dum Cantonment', 'Kankurgachi',
      'Shantinagar', 'Phoolbagan', 'Bagmari', 'Maniktala', 'Girish Park',
      'Bowbazar', 'Burrabazar', 'College Street', 'Sovabazar', 'Hatibagan'
    ],
    aliases: ['Calcutta']
  },
  {
    city: 'Howrah', state: 'West Bengal', lat: 22.5958, lng: 88.2636, radiusKm: 20,
    areas: [
      'Domjur', 'Andul', 'Sankrail', 'Shibpur', 'Bally', 'Liluah',
      'Belur', 'Uttarpara', 'Konnagar', 'Serampore', 'Rishra',
      'Kadamtala', 'Ghusuri', 'Salkia', 'Ramrajatala', 'Santragachi',
      'Golabari', 'Bamungachi', 'Jagacha', 'Panchla', 'Bagnan',
      'Uluberia', 'Amta', 'Udaynarayanpur', 'Jagatballavpur'
    ]
  },
  {
    city: 'Durgapur', state: 'West Bengal', lat: 23.5204, lng: 87.3119, radiusKm: 15,
    areas: ['Bidhannagar', 'Benachity', 'Bidhan Nagar', 'City Centre', 'Steel Township',
      'Andal', 'Kanksa', 'Raniganj', 'Jamuria', 'Pandabeswar']
  },
  {
    city: 'Asansol', state: 'West Bengal', lat: 23.6889, lng: 86.9661, radiusKm: 15,
    areas: ['Burnpur', 'Kulti', 'Jamuria', 'Barakar', 'Chittaranjan',
      'Raniganj', 'Salanpur', 'Hirapur', 'Dishergarh']
  },
  {
    city: 'Siliguri', state: 'West Bengal', lat: 26.7271, lng: 88.3953, radiusKm: 15,
    areas: ['Bagdogra', 'Matigara', 'Naxalbari', 'Phansidewa', 'Jalpaiguri',
      'Pradhan Nagar', 'Dabgram', 'Fulbari', 'Sevoke Road']
  },

  // ── MAHARASHTRA ────────────────────────────────────────────────
  {
    city: 'Mumbai', state: 'Maharashtra', lat: 19.0760, lng: 72.8777, radiusKm: 45,
    areas: [
      'Bandra', 'Andheri', 'Dadar', 'Juhu', 'Powai', 'Borivali',
      'Malad', 'Kandivali', 'Goregaon', 'Jogeshwari', 'Vile Parle',
      'Santacruz', 'Khar', 'Bandra Kurla Complex', 'Kurla', 'Ghatkopar',
      'Mulund', 'Thane', 'Vikhroli', 'Chembur', 'Mankhurd', 'Govandi',
      'Dharavi', 'Sion', 'Wadala', 'Parel', 'Worli', 'Lower Parel',
      'Elphinstone', 'Mahim', 'Byculla', 'Mazgaon', 'Dockyard Road',
      'Churchgate', 'CST', 'Marine Lines', 'Charni Road', 'Grant Road',
      'Matunga', 'Naigaon', 'Vasai', 'Virar', 'Mira Road', 'Bhayander',
      'Navi Mumbai', 'Vashi', 'Nerul', 'Belapur', 'Kharghar', 'Panvel',
      'Colaba', 'Fort', 'Nariman Point', 'Cuffe Parade', 'Sion'
    ]
  },
  {
    city: 'Pune', state: 'Maharashtra', lat: 18.5204, lng: 73.8567, radiusKm: 30,
    areas: [
      'Kothrud', 'Hinjewadi', 'Baner', 'Viman Nagar', 'Koregaon Park',
      'Kalyani Nagar', 'Wakad', 'Pimple Saudagar', 'Pimple Nilakh',
      'Aundh', 'Pashan', 'Balewadi', 'Bavdhan', 'Sus', 'Mahalunge',
      'Hadapsar', 'Magarpatta', 'Kharadi', 'Wagholi', 'Lohegaon',
      'Vishrantwadi', 'Kalewadi', 'Rahatani', 'Chinchwad', 'Pimpri',
      'Akurdi', 'Nigdi', 'Bhosari', 'Chakan', 'Talegaon',
      'Swargate', 'Deccan', 'Shivajinagar', 'Pune Camp', 'Kondhwa',
      'Undri', 'Pisoli', 'Wanowrie', 'Bibwewadi', 'Katraj', 'Dhankawadi'
    ]
  },
  {
    city: 'Nagpur', state: 'Maharashtra', lat: 21.1458, lng: 79.0882, radiusKm: 20,
    areas: ['Dharampeth', 'Sitabuldi', 'Sadar', 'Ramdaspeth', 'Bajaj Nagar',
      'Pratap Nagar', 'Hingna', 'Kamptee', 'Butibori', 'Wardha Road',
      'Civil Lines', 'Ambazari', 'Shankar Nagar', 'Trimurti Nagar']
  },
  {
    city: 'Nashik', state: 'Maharashtra', lat: 19.9975, lng: 73.7898, radiusKm: 15,
    areas: ['Satpur', 'Ambad', 'Cidco', 'Gangapur Road', 'College Road',
      'Deolali', 'Ozar', 'Trimbak Road', 'Panchvati', 'Dwarka']
  },
  {
    city: 'Aurangabad', state: 'Maharashtra', lat: 19.8762, lng: 75.3433, radiusKm: 15,
    areas: ['Cidco', 'Waluj', 'Chikalthana', 'Paithan Road', 'Garkheda',
      'Osmanpura', 'Padampura', 'Cantonment', 'Satara', 'Beed Bypass']
  },

  // ── DELHI NCR ──────────────────────────────────────────────────
  {
    city: 'Delhi', state: 'Delhi', lat: 28.6139, lng: 77.2090, radiusKm: 40,
    areas: [
      'Connaught Place', 'Lajpat Nagar', 'Saket', 'Dwarka', 'Rohini',
      'Pitampura', 'Janakpuri', 'Uttam Nagar', 'Vikaspuri', 'Paschim Vihar',
      'Punjabi Bagh', 'Model Town', 'GTB Nagar', 'Mukherjee Nagar',
      'Civil Lines', 'Kashmere Gate', 'Old Delhi', 'Chandni Chowk',
      'Karol Bagh', 'Patel Nagar', 'Rajendra Nagar', 'Naraina',
      'Vasant Kunj', 'Vasant Vihar', 'Mehrauli', 'Chattarpur',
      'Malviya Nagar', 'Greater Kailash', 'Kalkaji', 'Govindpuri',
      'Sangam Vihar', 'Badarpur', 'Okhla', 'Jasola', 'Sarita Vihar',
      'Shahdara', 'Preet Vihar', 'Mayur Vihar', 'Patparganj', 'Laxmi Nagar',
      'Dilshad Garden', 'Vivek Vihar', 'Anand Vihar', 'Ghaziabad',
      'Noida Sector 18', 'Noida Sector 62', 'Greater Noida', 'Gurgaon',
      'Faridabad', 'Bahadurgarh', 'Dwarka Expressway', 'Sohna Road'
    ],
    aliases: ['New Delhi', 'NCR']
  },

  // ── KARNATAKA ──────────────────────────────────────────────────
  {
    city: 'Bangalore', state: 'Karnataka', lat: 12.9716, lng: 77.5946, radiusKm: 35,
    areas: [
      'Koramangala', 'Indiranagar', 'Whitefield', 'HSR Layout', 'JP Nagar',
      'Hebbal', 'Yelahanka', 'Marathahalli', 'Sarjapur Road', 'Electronic City',
      'Bannerghatta Road', 'BTM Layout', 'Jayanagar', 'Basavanagudi',
      'Rajajinagar', 'Malleshwaram', 'Seshadripuram', 'Sadashivanagar',
      'RT Nagar', 'Banaswadi', 'Horamavu', 'Kammanahalli', 'CV Raman Nagar',
      'Domlur', 'Ejipura', 'Vivek Nagar', 'Bellandur', 'Kadugodi',
      'Varthur', 'Mahadevapura', 'KR Puram', 'Byndoor', 'Begur',
      'Bommanahalli', 'Hulimavu', 'Arekere', 'Gottigere', 'Hongasandra',
      'Kengeri', 'Rajarajeshwari Nagar', 'Uttarahalli', 'Nagarbhavi',
      'Vijayanagar', 'Tumkur Road', 'Peenya', 'Yeshwantpur', 'Majestic',
      'MG Road', 'Brigade Road', 'Commercial Street', 'UB City'
    ],
    aliases: ['Bengaluru']
  },
  {
    city: 'Mysore', state: 'Karnataka', lat: 12.2958, lng: 76.6394, radiusKm: 15,
    areas: ['Jayalakshmipuram', 'Saraswathipuram', 'Kuvempunagar', 'Hebbal',
      'Vijayanagar', 'Bannimantap', 'Dattagalli', 'Ramakrishmanagar']
  },
  {
    city: 'Mangalore', state: 'Karnataka', lat: 12.8698, lng: 74.8430, radiusKm: 15,
    areas: ['Hampankatta', 'Kadri', 'Attavar', 'Bejai', 'Falnir',
      'Balmatta', 'Kankanady', 'Bondel', 'Derebail', 'Surathkal']
  },

  // ── TAMIL NADU ──────────────────────────────────────────────────
  {
    city: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lng: 80.2707, radiusKm: 30,
    areas: [
      'T Nagar', 'Adyar', 'Anna Nagar', 'Velachery', 'Perungudi',
      'Sholinganallur', 'Perambur', 'Villivakkam', 'Ambattur', 'Avadi',
      'Thiruvottiyur', 'Tondiarpet', 'Washermanpet', 'Royapuram',
      'Purasawalkam', 'Egmore', 'Nungambakkam', 'Kilpauk', 'Shenoy Nagar',
      'Aminjikarai', 'Arumbakkam', 'Koyambedu', 'Vadapalani', 'Kodambakkam',
      'Ashok Nagar', 'KK Nagar', 'Virugambakkam', 'Valasaravakkam',
      'Porur', 'Tambaram', 'Chrompet', 'Pallavaram', 'Sembakkam',
      'Medavakkam', 'Madipakkam', 'Guindy', 'Ekkatuthangal', 'Saidapet',
      'Kotturpuram', 'Thiruvanmiyur', 'Besant Nagar', 'Mylapore'
    ]
  },
  {
    city: 'Coimbatore', state: 'Tamil Nadu', lat: 11.0168, lng: 76.9558, radiusKm: 20,
    areas: ['RS Puram', 'Ganapathy', 'Peelamedu', 'Singanallur', 'Kuniyamuthur',
      'Saibaba Colony', 'Race Course', 'Gandhipuram', 'Ukkadam', 'Uppilipalayam']
  },
  {
    city: 'Madurai', state: 'Tamil Nadu', lat: 9.9252, lng: 78.1198, radiusKm: 15,
    areas: ['KK Nagar', 'Anna Nagar', 'Tallakulam', 'Teppakulam', 'Bypass Road',
      'Nagamalai', 'Thirunagar', 'Narimedu', 'Goripalayam']
  },

  // ── TELANGANA ──────────────────────────────────────────────────
  {
    city: 'Hyderabad', state: 'Telangana', lat: 17.3850, lng: 78.4867, radiusKm: 35,
    areas: [
      'Hitech City', 'Banjara Hills', 'Gachibowli', 'Jubilee Hills',
      'Madhapur', 'Kondapur', 'Kukatpally', 'Miyapur', 'Bachupally',
      'Kompally', 'Secunderabad', 'Begumpet', 'Somajiguda', 'Ameerpet',
      'SR Nagar', 'Yousufguda', 'Mehdipatnam', 'Tolichowki', 'Masab Tank',
      'Attapur', 'Rajendranagar', 'Nanakramguda', 'Financial District',
      'Narsingi', 'Manikonda', 'Puppalaguda', 'Budvel', 'Kokapet',
      'LB Nagar', 'Dilsukhnagar', 'Vanasthalipuram', 'Hayathnagar',
      'Uppal', 'Nacharam', 'Habsiguda', 'Ramanthapur', 'Malkajgiri',
      'Alwal', 'Quthbullapur', 'Dundigal', 'Medchal', 'Shamshabad'
    ],
    aliases: ['Secunderabad', 'HITEC City']
  },
  {
    city: 'Warangal', state: 'Telangana', lat: 17.9784, lng: 79.5941, radiusKm: 15,
    areas: ['Hanamkonda', 'Kazipet', 'Hunter Road', 'Subedari', 'Mulugu Road']
  },

  // ── ANDHRA PRADESH ────────────────────────────────────────────
  {
    city: 'Visakhapatnam', state: 'Andhra Pradesh', lat: 17.6868, lng: 83.2185, radiusKm: 20,
    areas: ['MVP Colony', 'Madhurawada', 'Seethammadhara', 'Gajuwaka', 'Pendurthi',
      'Bheemunipatnam', 'Rushikonda', 'Dwaraka Nagar', 'Ram Nagar', 'Steel Plant'],
    aliases: ['Vizag']
  },
  {
    city: 'Vijayawada', state: 'Andhra Pradesh', lat: 16.5062, lng: 80.6480, radiusKm: 15,
    areas: ['Benz Circle', 'Governorpet', 'Labbipet', 'Moghalrajpuram', 'Patamata',
      'Penamaluru', 'Ramavarappadu', 'Eluru Road', 'MG Road']
  },

  // ── GUJARAT ────────────────────────────────────────────────────
  {
    city: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lng: 72.5714, radiusKm: 30,
    areas: [
      'Satellite', 'Navrangpura', 'Bopal', 'Prahlad Nagar', 'SG Highway',
      'Science City', 'Thaltej', 'Bodakdev', 'Vastrapur', 'Prahladnagar',
      'CG Road', 'Law Garden', 'Ellis Bridge', 'Usmanpura', 'Memnagar',
      'Chandkheda', 'Motera', 'Ranip', 'Sabarmati', 'Naroda',
      'Vatva', 'Odhav', 'Bapunagar', 'Maninagar', 'Narol',
      'Isanpur', 'Vastral', 'Nikol', 'Gota', 'New Ranip'
    ]
  },
  {
    city: 'Surat', state: 'Gujarat', lat: 21.1702, lng: 72.8311, radiusKm: 20,
    areas: ['Adajan', 'Pal', 'Vesu', 'Dumas Road', 'Althan', 'Katargam',
      'Varachha', 'Udhna', 'Amroli', 'Piplod', 'Bhatar', 'City Light'],
    aliases: ['Diamond City']
  },
  {
    city: 'Vadodara', state: 'Gujarat', lat: 22.3072, lng: 73.1812, radiusKm: 15,
    areas: ['Alkapuri', 'Fatehgunj', 'Sayajigunj', 'Akota', 'Gotri',
      'Productivity Road', 'Harni', 'Waghodia Road', 'Tarsali', 'Manjalpur']
  },
  {
    city: 'Rajkot', state: 'Gujarat', lat: 22.3039, lng: 70.8022, radiusKm: 15,
    areas: ['Race Course', 'Kalawad Road', 'Gondal Road', 'University Road',
      'Aji Dam', 'Mavdi', 'Satellite', 'Bhakti Nagar', 'Kanak Road']
  },

  // ── RAJASTHAN ──────────────────────────────────────────────────
  {
    city: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lng: 75.7873, radiusKm: 25,
    areas: [
      'Malviya Nagar', 'Vaishali Nagar', 'Mansarovar', 'Jagatpura',
      'Tonk Road', 'Ajmer Road', 'Sirsi Road', 'Pratap Nagar',
      'Sanganer', 'Muhana', 'Sitapura', 'Durgapura', 'Sodala',
      'Vidhyadhar Nagar', 'Shyam Nagar', 'Jhotwara', 'Bani Park',
      'C Scheme', 'Civil Lines', 'Pink City', 'MI Road', 'Sindhi Camp'
    ],
    aliases: ['Pink City']
  },
  {
    city: 'Jodhpur', state: 'Rajasthan', lat: 26.2389, lng: 73.0243, radiusKm: 15,
    areas: ['Ratanada', 'Sardarpura', 'Shastri Nagar', 'Basni', 'Chopasni Housing Board',
      'Pal Road', 'Mandore', 'Paota', 'Old City'],
    aliases: ['Blue City']
  },
  {
    city: 'Udaipur', state: 'Rajasthan', lat: 24.5854, lng: 73.7125, radiusKm: 12,
    areas: ['Hiran Magri', 'Sector 11', 'Sector 14', 'Pratap Nagar', 'Sukhadia Circle',
      'Lake Pichola', 'Old City', 'Fatehpura', 'Shobhagpura'],
    aliases: ['Lake City']
  },

  // ── PUNJAB & HARYANA ──────────────────────────────────────────
  {
    city: 'Chandigarh', state: 'Punjab', lat: 30.7333, lng: 76.7794, radiusKm: 20,
    areas: [
      'Sector 17', 'Sector 22', 'Sector 34', 'Sector 35', 'Sector 43',
      'Manimajra', 'IT Park', 'Panchkula', 'Mohali', 'Zirakpur',
      'Kharar', 'Derabassi', 'New Chandigarh', 'Mullanpur'
    ]
  },
  {
    city: 'Ludhiana', state: 'Punjab', lat: 30.9010, lng: 75.8573, radiusKm: 15,
    areas: ['Model Town', 'Sarabha Nagar', 'BRS Nagar', 'Dugri', 'Rajguru Nagar',
      'Pakhowal Road', 'Ferozepur Road', 'Hambran Road', 'Samrala Chowk']
  },
  {
    city: 'Amritsar', state: 'Punjab', lat: 31.6340, lng: 74.8723, radiusKm: 15,
    areas: ['Golden Temple Area', 'Ranjit Avenue', 'Green Avenue', 'Majitha Road',
      'GT Road', 'Mall Road', 'Lawrence Road', 'Daburji', 'Chheharta']
  },

  // ── UTTAR PRADESH ────────────────────────────────────────────
  {
    city: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lng: 80.9462, radiusKm: 25,
    areas: [
      'Hazratganj', 'Gomti Nagar', 'Aliganj', 'Indira Nagar', 'Mahanagar',
      'Vikas Nagar', 'Rajajipuram', 'Alambagh', 'Chinhat', 'Faizabad Road',
      'Sultanpur Road', 'Raibareli Road', 'Kanpur Road', 'Kursi Road',
      'Vibhuti Khand', 'Sector 7 Scheme', 'Sushant Golf City'
    ]
  },
  {
    city: 'Kanpur', state: 'Uttar Pradesh', lat: 26.4499, lng: 80.3319, radiusKm: 20,
    areas: ['Civil Lines', 'Swaroop Nagar', 'Kakadeo', 'Kalyanpur', 'Govind Nagar',
      'Panki', 'Kidwai Nagar', 'Armapur', 'GT Road', 'Shyam Nagar']
  },
  {
    city: 'Agra', state: 'Uttar Pradesh', lat: 27.1767, lng: 78.0081, radiusKm: 15,
    areas: ['Taj Mahal Area', 'Sadar Bazaar', 'Sikandra', 'Kalindi Vihar', 'Bodla',
      'Belanganj', 'Shahganj', 'Kamla Nagar', 'Wazirpura']
  },
  {
    city: 'Varanasi', state: 'Uttar Pradesh', lat: 25.3176, lng: 82.9739, radiusKm: 15,
    areas: ['Ghats Area', 'Sigra', 'Lanka', 'BHU Area', 'Cantt',
      'Mahmoorganj', 'Sarnath', 'Orderly Bazaar', 'Shivpur'],
    aliases: ['Banaras', 'Kashi']
  },
  {
    city: 'Allahabad', state: 'Uttar Pradesh', lat: 25.4358, lng: 81.8463, radiusKm: 15,
    areas: ['Civil Lines', 'Triveni', 'Lukerganj', 'George Town', 'Naini',
      'Jhusi', 'Bamrauli', 'Phaphamau', 'Muthiganj'],
    aliases: ['Prayagraj']
  },
  {
    city: 'Noida', state: 'Uttar Pradesh', lat: 28.5355, lng: 77.3910, radiusKm: 20,
    areas: [
      'Sector 18', 'Sector 62', 'Sector 63', 'Sector 15', 'Sector 44',
      'Sector 50', 'Sector 76', 'Sector 137', 'Sector 150',
      'Greater Noida', 'Greater Noida West', 'Knowledge Park',
      'Alpha', 'Beta', 'Gamma', 'Delta', 'Zeta', 'Chi Phi'
    ]
  },
  {
    city: 'Ghaziabad', state: 'Uttar Pradesh', lat: 28.6692, lng: 77.4538, radiusKm: 15,
    areas: ['Vaishali', 'Indirapuram', 'Vasundhara', 'Rajnagar Extension',
      'Crossings Republik', 'Kaushambi', 'Mohan Nagar', 'Dilshad Garden']
  },

  // ── MADHYA PRADESH ────────────────────────────────────────────
  {
    city: 'Indore', state: 'Madhya Pradesh', lat: 22.7196, lng: 75.8577, radiusKm: 20,
    areas: ['Vijay Nagar', 'Palasia', 'Sapna Sangeeta', 'MG Road', 'Bhanwarkuan',
      'Scheme 78', 'Scheme 140', 'Mhow Naka', 'Lasudia', 'Rau']
  },
  {
    city: 'Bhopal', state: 'Madhya Pradesh', lat: 23.2599, lng: 77.4126, radiusKm: 20,
    areas: ['MP Nagar', 'Kolar Road', 'Hoshangabad Road', 'Arera Colony',
      'TT Nagar', 'New Market', 'Shyamla Hills', 'Mansarovar Complex',
      'Misrod', 'Bairagarh', 'Berasia Road']
  },
  {
    city: 'Jabalpur', state: 'Madhya Pradesh', lat: 23.1815, lng: 79.9864, radiusKm: 15,
    areas: ['Civil Lines', 'Napier Town', 'Gorakhpur', 'Adhartal', 'Panagar',
      'Shahpura', 'Mandla Road', 'Damoh Naka']
  },

  // ── BIHAR ────────────────────────────────────────────────────
  {
    city: 'Patna', state: 'Bihar', lat: 25.5941, lng: 85.1376, radiusKm: 20,
    areas: [
      'Boring Road', 'Kankarbagh', 'Rajendra Nagar', 'Bailey Road',
      'Patna Sahib', 'Digha', 'Danapur', 'Phulwarisharif', 'Khagaul',
      'Kurji', 'Anisabad', 'Rukanpura', 'Saidpur', 'Gandhi Maidan Area'
    ]
  },
  {
    city: 'Gaya', state: 'Bihar', lat: 24.7955, lng: 84.9994, radiusKm: 10,
    areas: ['Bodhgaya', 'Civil Lines', 'Sherghati', 'Tekari', 'Manpur']
  },

  // ── ODISHA ────────────────────────────────────────────────────
  {
    city: 'Bhubaneswar', state: 'Odisha', lat: 20.2961, lng: 85.8245, radiusKm: 20,
    areas: ['Sahid Nagar', 'Nayapalli', 'Patia', 'Chandrasekharpur', 'Khandagiri',
      'Infocity', 'Mancheswar', 'Nalco Nagar', 'Jayadev Vihar', 'IRC Village',
      'Acharya Vihar', 'Satya Nagar', 'Baramunda']
  },
  {
    city: 'Cuttack', state: 'Odisha', lat: 20.4625, lng: 85.8828, radiusKm: 12,
    areas: ['Buxi Bazaar', 'College Square', 'Badambadi', 'Madhupatna', 'Jagatpur']
  },

  // ── ASSAM ────────────────────────────────────────────────────
  {
    city: 'Guwahati', state: 'Assam', lat: 26.1445, lng: 91.7362, radiusKm: 20,
    areas: ['Dispur', 'Paltan Bazaar', 'Chandmari', 'Ulubari', 'Ganeshguri',
      'Six Mile', 'Zoo Road', 'Beltola', 'Hatigaon', 'Jalukbari',
      'Maligaon', 'Adabari', 'Bhangagarh', 'Narengi']
  },

  // ── JHARKHAND ────────────────────────────────────────────────
  {
    city: 'Ranchi', state: 'Jharkhand', lat: 23.3441, lng: 85.3096, radiusKm: 15,
    areas: ['Lalpur', 'Harmu', 'Bariatu', 'Doranda', 'Kanke Road',
      'Ratu Road', 'Hinoo', 'Booty Road', 'Dipatoli']
  },
  {
    city: 'Jamshedpur', state: 'Jharkhand', lat: 22.8046, lng: 86.2029, radiusKm: 15,
    areas: ['Bistupur', 'Sakchi', 'Telco', 'Adityapur', 'Mango',
      'Jugsalai', 'Baridih', 'Kadma'],
    aliases: ['Tatanagar']
  },

  // ── KERALA ────────────────────────────────────────────────────
  {
    city: 'Kochi', state: 'Kerala', lat: 9.9312, lng: 76.2673, radiusKm: 20,
    areas: [
      'Ernakulam', 'Fort Kochi', 'Kakkanad', 'Edappally', 'Aluva',
      'Kaloor', 'Panampilly Nagar', 'Palarivattom', 'Vyttila',
      'Tripunithura', 'Thrikkakara', 'Kalamassery', 'Perumbavoor'
    ],
    aliases: ['Cochin']
  },
  {
    city: 'Thiruvananthapuram', state: 'Kerala', lat: 8.5241, lng: 76.9366, radiusKm: 15,
    areas: ['Kowdiar', 'Pattom', 'Karamana', 'Sreekaryam', 'Vellayambalam',
      'Kesavadasapuram', 'Technopark', 'Attipra', 'Nemom'],
    aliases: ['Trivandrum']
  },
  {
    city: 'Kozhikode', state: 'Kerala', lat: 11.2588, lng: 75.7804, radiusKm: 15,
    areas: ['Calicut Beach', 'Palayam', 'SM Street', 'Nadakkave', 'Chevayur',
      'Perinthalmanna', 'Mavoor Road', 'Medical College Area'],
    aliases: ['Calicut']
  },
  {
    city: 'Thrissur', state: 'Kerala', lat: 10.5276, lng: 76.2144, radiusKm: 12,
    areas: ['Round South', 'Round North', 'MG Road', 'Ayyanthole', 'Punkunnam',
      'Poothole', 'Ollur', 'Chalakudy']
  },

  // ── HIMACHAL PRADESH ─────────────────────────────────────────
  {
    city: 'Shimla', state: 'Himachal Pradesh', lat: 31.1048, lng: 77.1734, radiusKm: 10,
    areas: ['Mall Road', 'Lakkar Bazaar', 'Sanjauli', 'Chotta Shimla',
      'Vikasnagar', 'New Shimla', 'Rampur Bushahr']
  },
  {
    city: 'Manali', state: 'Himachal Pradesh', lat: 32.2396, lng: 77.1887, radiusKm: 8,
    areas: ['Old Manali', 'Vashisht', 'Mall Road', 'Naggar', 'Solang Valley', 'Rohtang']
  },

  // ── UTTARAKHAND ──────────────────────────────────────────────
  {
    city: 'Dehradun', state: 'Uttarakhand', lat: 30.3165, lng: 78.0322, radiusKm: 15,
    areas: ['Rajpur Road', 'Vasant Vihar', 'Saharanpur Road', 'Rishikesh Road',
      'Mussoorie Road', 'Ballupur', 'Dalanwala', 'Kanwali', 'Jakhan']
  },
  {
    city: 'Haridwar', state: 'Uttarakhand', lat: 29.9457, lng: 78.1642, radiusKm: 10,
    areas: ['Har Ki Pauri', 'Jwalapur', 'Shivalik Nagar', 'SIDCUL', 'Ranipur', 'Bahadrabad']
  },
  {
    city: 'Rishikesh', state: 'Uttarakhand', lat: 30.0869, lng: 78.2676, radiusKm: 8,
    areas: ['Laxman Jhula', 'Ram Jhula', 'Tapovan', 'Muni Ki Reti', 'Swargashram']
  },

  // ── GUJRAT OTHER ─────────────────────────────────────────────
  {
    city: 'Gandhinagar', state: 'Gujarat', lat: 23.2156, lng: 72.6369, radiusKm: 12,
    areas: ['Sector 1', 'Sector 7', 'Sector 16', 'Sector 21', 'Sector 30',
      'Infocity', 'GIFT City', 'Adalaj']
  },

  // ── CHHATTISGARH ────────────────────────────────────────────
  {
    city: 'Raipur', state: 'Chhattisgarh', lat: 21.2514, lng: 81.6296, radiusKm: 15,
    areas: ['Shankar Nagar', 'Tatibandh', 'Mowa', 'Pandri', 'Telibandha',
      'Fafadih', 'VIP Road', 'Devendra Nagar', 'Avanti Vihar']
  },

  // ── GOA ──────────────────────────────────────────────────────
  {
    city: 'Panaji', state: 'Goa', lat: 15.4909, lng: 73.8278, radiusKm: 15,
    areas: ['Fontainhas', 'Campal', 'Miramar', 'Dona Paula', 'Caranzalem',
      'Porvorim', 'Mapusa', 'Calangute', 'Baga', 'Anjuna', 'Vagator'],
    aliases: ['Panjim', 'Goa']
  },

  // ── NORTHEAST ────────────────────────────────────────────────
  {
    city: 'Imphal', state: 'Manipur', lat: 24.8170, lng: 93.9368, radiusKm: 12,
    areas: ['Paona Bazaar', 'Thangal Bazaar', 'Singjamei', 'Langol', 'Lamphel', 'Keishamthong']
  },
  {
    city: 'Shillong', state: 'Meghalaya', lat: 25.5788, lng: 91.8933, radiusKm: 10,
    areas: ['Police Bazaar', 'Laitumkhrah', 'Nongthymmai', 'Malki', 'Ri Bhoi', 'Mawlai']
  },
]

// Generate city names list for CitySelector
export const CITY_NAMES = INDIA_CITIES.map(c => ({
  name: c.city,
  state: c.state,
  lat: c.lat,
  lng: c.lng })).sort((a, b) => a.name.localeCompare(b.name))

// Generate SQL INSERT for city_areas table
export function generateCityAreaSQL(): string {
  const rows: string[] = []
  for (const city of INDIA_CITIES) {
    for (const area of city.areas) {
      rows.push(
        `('${city.city.replace(/'/g, "''")}', '${area.replace(/'/g, "''")}', ` +
        `'${city.state.replace(/'/g, "''")}', 'India', ` +
        `${city.lat}, ${city.lng}, 5.0)`
      )
    }
  }
  return `INSERT INTO city_areas (city, area, state, country, center_lat, center_lng, radius_km) VALUES\n` +
    rows.join(',\n') +
    `\nON CONFLICT (city, area) DO NOTHING;`
}
