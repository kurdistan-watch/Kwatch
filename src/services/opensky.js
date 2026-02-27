import axios from 'axios'

const api = axios.create({
    baseURL: 'https://opensky-network.org/api',
})

export const fetchLiveFlights = async (bbox) => {
    // console.log('Fetching flights for bbox:', bbox)
    return []
}

export default api
