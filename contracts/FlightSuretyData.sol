pragma solidity ^0.4.25;

import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";


contract FlightSuretyData {
    using SafeMath for uint256;

    /********************************************************************************************/
    /*                                       DATA VARIABLES                                     */
    /********************************************************************************************/

    address private contractOwner;                  // Account used to deploy contract
    bool private operational = true;                // Blocks all state changes throughout the contract if false

    uint256 public constant AIRLINE_FEE = 10 ether;

    // contract funds
    uint private balance;

    // credit balance of given address
    mapping(address => uint256) private credits;
    // for a given flightKey, the insurance balances of each insuree
    mapping(bytes32 => mapping(address => uint256)) private insurances;

    struct Flight {
        bool isRegistered;
        uint8 statusCode;
        uint256 departureTimestamp;
        uint256 updatedTimestamp;        
        address airline;
    }

    mapping(bytes32 => Flight) private flights;

    // airlines
    struct Airline {
        bool isRegistered;
        uint256 invitations;
        mapping(address => bool) hasInvited;
        uint256 deposit;
    }

    mapping(address => Airline) private airlines;

    // register airline
    uint256 private registerdAirline = 0;

    // Flight status codes, this should be synced with all the codes
    // in FlightSureApp
    uint8 private constant STATUS_CODE_UNKNOWN = 0;
    uint8 private constant STATUS_CODE_ON_TIME = 10;
    uint8 private constant STATUS_CODE_LATE_AIRLINE = 20;
    uint8 private constant STATUS_CODE_LATE_WEATHER = 30;
    uint8 private constant STATUS_CODE_LATE_TECHNICAL = 40;
    uint8 private constant STATUS_CODE_LATE_OTHER = 50;

    /********************************************************************************************/
    /*                                       EVENT DEFINITIONS                                  */
    /********************************************************************************************/

    // event AirlineRegistered(string name, address addr);
    // event AirlineFunded(string name, address addr);
    // event FlightRegistered(bytes32 flightKey, address airline, string flight, 
    // string from, string to, uint256 timestamp);
    // event InsuranceBought(address airline, string flight, 
    //uint256 timestamp, address passenger, uint256 amount, uint256 multiplier);
    // event FlightStatusUpdated(address airline, string flight, uint256 timestamp, uint8 statusCode);
    // event InsureeCredited(address passenger, uint256 amount);
    // event AccountWithdrawn(address passenger, uint256 amount);

    /**
    * @dev Constructor
    *      The deploying account becomes contractOwner
    */


    constructor () public {

        contractOwner = msg.sender;
        // registerdAirline = 1;
        // fund(msg.value);
    }

    /********************************************************************************************/
    /*                                       FUNCTION MODIFIERS                                 */
    /********************************************************************************************/

    // Modifiers help avoid duplication of code. They are typically used to validate something
    // before a function is allowed to be executed.

    /**
    * @dev Modifier that requires the "operational" boolean variable to be "true"
    *      This is used on all state changing functions to pause the contract in 
    *      the event there is an issue that needs to be fixed
    */


    modifier requireIsOperational() 
    {
        require(operational, "Contract is currently not operational");
        _;  // All modifiers require an "_" which indicates where the function body will be added
    }

    /**
    * @dev Modifier that requires the "ContractOwner" account to be the function caller
    */
    modifier requireContractOwner()
    {
        require(msg.sender == contractOwner, "Caller is not contract owner");
        _;
    }

    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    /**
    * @dev Get operating status of contract
    *
    * @return A bool that is the current operating status
    */      
    function isOperational() public view returns(bool) 
    {
        return operational;
    }


    /**
    * @dev Sets contract operations on/off
    *
    * When operational mode is disabled, all write transactions except for this one will fail
    */    
    function setOperatingStatus(bool mode) 
        external
        requireContractOwner() 
    {
        operational = mode;
    }

    /********************************************************************************************/
    /*                                     SMART CONTRACT FUNCTIONS                             */
    /********************************************************************************************/

   /**
    * @dev Add an airline to the registration queue
    *      Can only be called from FlightSuretyApp contract
    *
    */   
    function registerAirline( address airline, address inviteAirline)
        external
        returns(bool success, uint256 votes)
    {
        require(!airlines[airline].isRegistered, 'Airline is already registered.');
        require(!airlines[msg.sender].hasInvited[airline], 'You have voted already.');

        Airline memory airLine = airlines[airline];

        // it takes 1 vote to register the first 4 airlines
        if (registerdAirline < 4) {
            airlines[inviteAirline].hasInvited[airline] = true;
            registerdAirline++;
            airLine.isRegistered = true;
            airLine.invitations = 1;
            return (true, 1);
        } else {

            airLine.invitations += 1;
            // it takes a majority of registered airlines' votes to register any additional airline
            if (airLine.invitations.mul(2) >= registerdAirline) {
                registerdAirline++;
                airLine.isRegistered = true;
                return (true, airLine.invitations);
            } else {
                return (false, airLine.invitations);
            }
        }
    }

   /**
    * @dev Register a flight
    *
    */   
    function registerFlight(address airline, string flight , uint256 departureTimestamp)
        external
        // isCallerAuthorized()
        returns(bool)
    {
        require(airlines[airline].isRegistered, "Airlines are not registered");
        bytes32 flightKey = getFlightKey(airline, flight, departureTimestamp);

        Flight memory flightInstance = flights[flightKey];
        flightInstance.isRegistered = true;
        flightInstance.departureTimestamp = departureTimestamp;
        flightInstance.airline = airline;

        return true;
    }


    /**
    * @dev Set status code for a flight
    *
    */   
    function setFlightStatus
                            (
                                bytes32 flightKey,
                                uint8 statusCode
                            )
                            external // DANGER
                            // isCallerAuthorized()
                            returns(uint8)
    {
        flights[flightKey].statusCode = statusCode;
        return statusCode;
    }


   /**
    * @dev Buy insurance for a flight
    *
    */   
    function buy (address airline, string flight, uint256 timestamp)
        external
        payable
    {
        require(msg.value > 0 && msg.value <= 1 ether, 'Pay up to 1 Ether');
        bytes32 flightKey = getFlightKey(airline, flight, timestamp);
        insurances[flightKey][msg.sender] = msg.value;
    }

    /**
     *  @dev Credits payouts to insurees
    */
    function creditInsurees(address passenger, address airline, string flight, uint256 departureTimestamp)
        external
        // isCallerAuthorized()
        returns(bool)        
    {
        bytes32 flightKey = getFlightKey(airline, flight, departureTimestamp);
        require(flights[flightKey].statusCode == STATUS_CODE_LATE_AIRLINE, 'This flight is on time');

        uint256 passengerBalance = insurances[flightKey][passenger];
        require(passengerBalance > 0, "Has not bought insurance");

        uint256 payout = insurances[flightKey][passenger].mul(3).div(2);
        uint256 credit = credits[passenger];
        insurances[flightKey][passenger] = insurances[flightKey][passenger].sub(passengerBalance);
        credits[passenger] = credit.add(payout);
        require(credit.add(payout) > 0, 'No credits to pay out');
    }

    

    /**
     *  @dev Transfers eligible payout funds to insuree
     *
    */
    function pay() external
    {
        uint256 credit = credits[msg.sender];
        credits[msg.sender] = 0;
        msg.sender.transfer(credit);
    }

   /**
    * @dev Initial funding for the insurance. Unless there are too many delayed flights
    *      resulting in insurance payouts, the contract should be self-sustaining
    *
    */   
    function fund(uint256 amount) public
    {
        balance = balance.add(amount);
    }

    function getFlightKey
                        (
                            address airline,
                            string memory flight,
                            uint256 timestamp
                        )
                        pure
                        internal
                        returns(bytes32) 
    {
        return keccak256(abi.encodePacked(airline, flight, timestamp));
    }

    function isAirline(address candidateAirline)
        external
        view
        returns(bool)
    {
        Airline memory airline = airlines[candidateAirline];
        return airline.isRegistered && (airline.deposit >= AIRLINE_FEE);
    }

    function isRegistered(address airline)
        public
        view
        returns(bool)
    {
        return airlines[airline].isRegistered;
    }


    function depositAirlineFee(address airline)
        external
        payable
        requireIsOperational()
        // isCallerAuthorized()
        returns(bool)
    {
        require(airlines[airline].isRegistered, 'Airline not Registered yet !');
        Airline memory airLine = airlines[airline];
        airLine.deposit += msg.value;
        return true;
    }

    /**
    * @dev Fallback function for funding smart contract.
    *
    */
    function() 
                            external 
                            payable 
    {
        fund(msg.value);
    }


}

