const Env = require('dotenv').config() 
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const agrilocationRoutes = require('./routes/agrilocation.js');
const multer = require('multer');
const multerS3 = require('multer-s3');
const aws = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const app = express();

/*const addMachine = (req, res, next)=>{
    s3.putObject(
      {
        Bucket:'inspekt-prod',
        Key:'AGRILOCATION/machine_catalog', //2 paramètres obligatoires pour toute méthode s3 (/ inplicite entre Bucket et Key)
        Body:JSON.stringify(req.body) // uniquement nécessaire pour les requêtes POST
      },
      (error,response)=>{
          res.status(
            error ? 400 : 201
          ).json(
            {error,response}
          )      
      })
}*/

/*const getCustomers = (req, res, next)=>{
  s3.getObject(
    {
      Bucket:'inspekt-prod',
      Key:'AGRILOCATION/customer_catalog', //2 paramètres obligatoires pour toute méthode s3 (/ inplicite entre Bucket et Key)
    },
    (error,data)=>{
        res.status(
          error ? 400 : 201
        ).send(
          {data:JSON.parse(data.Body.toString())}
        )
    })
}*/

app.use((req,res,next)=>{
  if(req.originalUrl === '/favicon.ico'){
      res.status(204).json({nope:true});
  }else{
      next();
  }
})

/// enable CORS ///
app.use(cors());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', "*"); 
    res.header('Access-Control-Allow-Headers', "Content-Type, X-Requested-With, Origin, Accept");
    next()
})

app.use(bodyParser.urlencoded({ 
    parameterLimit: 100000,
    limit: '50mb',
    extended : true 
}))

app.use(bodyParser.json({
  limit: '50mb',
  extended: true
}))

const s3 = new aws.S3();

const upload = multer({
  storage:multerS3({
      s3,
      bucket:process.env.S3_MEDIAS_BUCKET,    
      contentType:multerS3.AUTO_CONTENT_TYPE,
      acl:'public-read',
      metadata:function(req,file,callback){callback(null,{fieldName:file.fieldname})},
      key:function(req,file,callback){callback(null,'inspekt_'+Date.now())},
  })
});

//app.use('/',agrilocationRoutes);

app.get('/get/machine',
  (req, res, next)=>{
    s3.getObject(     
      {
        Bucket:'inspekt-prod',
        Key:'AGRILOCATION/machine_catalog', //2 paramètres obligatoires pour toute méthode s3 (/ inplicite entre Bucket et Key)
      },
      //Prévoir un check de l'existence du bucket avec (data&&data.Body&data.Body.toString()) || [] 
      //erreur de key => s3 renvoi noSuchKey
      //voir BucketActions dans le backend d'Inspekt
      (error,data)=>{
          //console.log('data : ',JSON.parse(data.Body.toString()))
          res.status(
            error ? 400 : 201
          ).send(
            {data:JSON.parse(data.Body.toString())}
          )      
      })
  });

app.post('/post/deleteBooking',async(req,res,next)=>{
  const bookingToDelete = req.body;
  delete bookingToDelete.firstBookingDate;
  

  s3.getObject({
    Bucket:'inspekt-prod',
    Key:'AGRILOCATION/machine_catalog',
  },
  (error,data)=>{
    try{
      const MACHINE_CATALOG = JSON.parse(data.Body.toString());
      //console.log('MACHINE_CATALOG : ',MACHINE_CATALOG);
      const MACHINE_CATALOG_UPDATED = MACHINE_CATALOG.map(machine=>{
        
        if(machine.id === bookingToDelete.idMachine){
          /**SET THE BOOKING ARRAY BY SUBSTRACT THE BOOKING RECEIVED */
          console.log('machine : ',machine);
          const newBookingList = [];
          machine.booking.forEach(booking=>{

            if(JSON.stringify(bookingToDelete) != JSON.stringify(booking)){
              newBookingList.push(booking);
            }

          })

          machine.booking = newBookingList;
          console.log('machine : ',machine);
          return machine;

        }else{
          /**JUST COPY THE MACHINE WITH NO MODIFICATION */
          return machine;
        }

      });

      s3.putObject(
        {
          Bucket:'inspekt-prod',
          Key:'AGRILOCATION/machine_catalog', //2 paramètres obligatoires pour toute méthode s3 (/ inplicite entre Bucket et Key)
          Body:JSON.stringify(MACHINE_CATALOG_UPDATED) // uniquement nécessaire pour les requêtes POST
        },
        (error,response)=>{
            res.status(
              error ? 400 : 201
            ).json(
              {error,response}
            )
        }
      )
    }catch(error){
      console.log('get-machine-catalog error : ',error);
    }
    
  })

})

app.post('/post/addBooking', async(req, res, next)=>{
    
  const newBooking = req.body;

  /**GET ALL THE MACHINE CATALOG */
    s3.getObject(
      {
        Bucket:'inspekt-prod',
        Key:'AGRILOCATION/machine_catalog',
      },
      (error,data)=>{
        let MACHINE_CATALOG = JSON.parse(data.Body.toString());
        const targetMachine = MACHINE_CATALOG.filter(element=>element.id == newBooking.idMachine);
        
        try{
          let bookingMerged = targetMachine[0].booking?[...targetMachine[0].booking]:[];
          bookingMerged.push(newBooking);

          /**UPDATE MACHINE OF MACHINE_CATALOG WHICH IS CONCERNED BY THE NEW BOOKING */
          const MACHINE_CATALOG_UPDATED = MACHINE_CATALOG.map((machine)=>{

            if(machine.id == newBooking.idMachine){

              let machineUpdated = machine;
              machineUpdated.booking = bookingMerged;
              return (machineUpdated);

            }else{

              return (machine);

            } 
          })
  /**UPLAOD ALL THE MACHINE CATALOG UPDATED */
          s3.putObject(
            {
              Bucket:'inspekt-prod',
              Key:'AGRILOCATION/machine_catalog', //2 paramètres obligatoires pour toute méthode s3 (/ inplicite entre Bucket et Key)
              Body:JSON.stringify(MACHINE_CATALOG_UPDATED) // uniquement nécessaire pour les requêtes POST
            },
            (error,response)=>{
                res.status(
                  error ? 400 : 201
                ).json(
                  {error,response}
                )
            }
          )

        }catch(error){
          console.log('erreur : ',error);
        }
      }
    )   
})

app.post('/post/addMachineImage',upload.array('filedata'),(req,res)=>{

  s3.getObject(
    {
      Bucket:'inspekt-prod',
      Key:'AGRILOCATION/machine_catalog',
    },
    async(error,data)=>{
      let MACHINE_CATALOG = await JSON.parse(data.Body.toString());
      let newCatalog = [...MACHINE_CATALOG];

      const uuid = uuidv4();

      let machine = req.body;
      machine.id = uuid;
      machine.visible = true;
      if(req.files[0]){
        machine.image_url = req.files[0].location;
      }else{
        machine.image_url = 'noImageUrl'
      }
      
      newCatalog.push(machine);
      
      console.log('newCatalog : ',newCatalog);
      if(machine.brand=='undefined' || machine.brand=='' || machine.nature=='undefined' || machine.nature=='' ||machine.type=='undefined' || machine.type=='' || machine.day_price=='undefined' || machine.day_price=='' || machine.unit_price=='undefined' || machine.unit_price=='' || machine.unit_label=='undefined' || machine.unit_label==''){
        res.status(400).send('noData');
      }else{
        console.log('saving into database',machine.brand);
        s3.putObject(
          {
            Bucket:'inspekt-prod',
            Key:'AGRILOCATION/machine_catalog', //2 paramètres obligatoires pour toute méthode s3 (/ inplicite entre Bucket et Key)
            Body:JSON.stringify(newCatalog) // uniquement nécessaire pour les requêtes POST
          },
          (error,response)=>{
              res.status(
                error ? 400 : 201
              ).json(
                {error,response}
              )
            
          })
      }
      
      })
  
  //res.status(200).send(req.files);
});

app.listen(4001);