const { TripMember, ItineraryData, DayData, SlotData } = require("../../config/db");

async function isTripAdmin(req, res, next) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ message: "Unauthorized access" });
        }

        let tripId = null;

        if (req.params.tripId) {
            tripId = req.params.tripId;
        } else if (req.params.itineraryId) {
            const itinerary = await ItineraryData.findByPk(req.params.itineraryId);
            if (itinerary) {
                tripId = itinerary.trip_id;
            }
        } else if (req.params.dayId) {
            const day = await DayData.findByPk(req.params.dayId);
            if (day) {
                const itinerary = await ItineraryData.findByPk(day.itinerary_id);
                if (itinerary) {
                    tripId = itinerary.trip_id;
                }
            }
        } else if (req.params.slotId) {
            const slot = await SlotData.findByPk(req.params.slotId);
            if (slot) {
                const day = await DayData.findByPk(slot.day_id);
                if (day) {
                    const itinerary = await ItineraryData.findByPk(day.itinerary_id);
                    if (itinerary) {
                        tripId = itinerary.trip_id;
                    }
                }
            }
        }

        if (!tripId) {
            return res.status(400).json({ message: "Unable to determine trip ID" });
        }
        
        const tripMember = await TripMember.findOne({
            where: {
                userId: req.user.id,
                tripId: tripId,
                role: 'admin'
            }
        });

        if (tripMember) {
            next();
        } else {
            return res.status(403).json({ message: "Forbidden: Trip admins only" });
        }
    } catch (error) {
        console.error("Trip admin check error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = isTripAdmin;