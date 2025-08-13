
#include "defines.h"
#include "functions.h"


#define RES_fx    1  /*  fixed point resolution  */

/*-----------------------------------------------------------------------------
 * peak_locator_fx()
 *----------------------------------------------------------------------------*/
void plc_phEcu_peak_locator(const int16_t *inp, /* i: vector with values >=0   ,Qx      */
   const int16_t  inp_len,              /* i: length of inp                                 */
   int16_t *      int_plocs,            /* o:  array of filtered integer plocs           Q0 */
   int16_t *      n_fsc,                /* o:  total_ number of filtered located highs   Q0 */
   const int16_t  sens,                 /* i  sensitivity,   Qx */
   const int16_t  inp_high,             /* i  global high ,  Qx */
   const int16_t  inp_low,              /* i:  global low,  Qx */
   int16_t maxLprot_Red,                /* i:  optional size for wc memory alloc of scratch buffer  */
   int8_t *scratchBuffer                /* i: : scratch buffer      2*  3*(1+1+(maxLprot_Red/2)+1) */
)
{
   int32_t       j, k, n, idx_high, idx_low;
   int16_t        inp_len_minus1 ;
   int16_t        pairs_start, pairs_end;
   int16_t        *p_tmp;
   int16_t        prev_delta, curr_delta;
   int16_t        delta_predc, delta_fin;
   int16_t        add_dc_flag, add_fin_flag;
   int16_t        low_val_cand_pairs,  val_range;
   int16_t        num_pairs, n_tail_values;
   int16_t        cand_phase_start, cand_idx, prev_low_plus_sens, tmp;

   int16_t        cand_high, prev_low;
   int16_t      *sc_idx; /* 1+ 128/2+1, or 1+ 256/2+1  ...  1+ 640/2+1  or 1+ 768/2+1*/
   int16_t      *cand_pairs_buf ; /*  actually  lowVal + [DC ] + (368/2)pairs + [FS/2]   */
   int16_t      *cand_pairs; /*  actually  [DC ] + pairs + [FS/2]   */
   int16_t      * fsc_idx; /*  list  of high  locations  in   sc__idx  1+368/2+1 */

   //TRACE("PhECU::peak_locator_fx(1st)");
   sc_idx          = (int16_t *)scratchBuffer;                      /* ByteSize = 2 * (1+ inp_len+1) */
   cand_pairs_buf  = (int16_t *)(((uint8_t *)sc_idx) + sizeof(*sc_idx) * (1+inp_len+1)); /* ByteSize = 2 * (1+ 1+ inp_len+1   ) */
   fsc_idx         = (int16_t *)(((uint8_t *)cand_pairs_buf) + sizeof(*cand_pairs_buf) * (1+ 1+ inp_len+1));  /* ByteSize = 2 * ( 1+ inp_len + 1) */
   ASSERT_LC3((4 * maxLprot_Red) >= 3 * (1 + 1 + inp_len + 1)); /* basic buffer check */

   inp_len_minus1 = sub(inp_len, 1);  /* size of delta=derivative array ,and last index in inp */
    
   cand_pairs  = &cand_pairs_buf[1];  /* ptr init , make space for storing a lowest  amplitude value in location  -1    */
   pairs_start = 1;          /* adjusted to zero or 1 or 2 when/if,  DC is injected  as sc_idx[0], or initial plateau skipped */
  
   p_tmp = &(sc_idx[pairs_start]); /* ptr init */
  

   /*  xor high/low pairs of delta_inp and save sign changes */
   prev_delta = sub(inp[1], inp[0]);  /*  precompute very first delta */

   for(n = 1;  n < inp_len_minus1; n++)
   {   /* sign change analysis */
      curr_delta = sub(inp[n + 1], inp[n]);    /*  n+1 ,n ,   are loop ptrs   */
      if (s_xor(prev_delta, curr_delta) < 0)   /* a "0" delta  treated as a  positive sign */
      {
         *p_tmp++ = n;               /* store sign change bin locations , location n in the inp[] signal */
      }
      prev_delta = curr_delta; 
   }

   L_sub(0, 0); /* account for length calculaton */
   k = (int16_t)(p_tmp - &(sc_idx[pairs_start]));  

    
   /* copy sign change location values to a pairs array */
   /* leave one initial sc_idx location open for a potential initial DC value */

   ASSERT_LC3(pairs_start >= 0 && ((k - 1) + pairs_start) < (inp_len +2));
   for(j = 0; j < k; j++)
   {
      cand_pairs[j + pairs_start] = inp[sc_idx[j + pairs_start]];     /*  the indirect  should be  calculated */
   }


   /* filter away a potential  single initial/trailing  plateau
     to enable correct analysis for adding DC or  fs/2 bins */

   
   if ((sub(k, 2) >= 0) &&
      (sub(cand_pairs[pairs_start], cand_pairs[pairs_start + 1]) == 0))
   {
      pairs_start = add(pairs_start, 1);
      k = sub(k, 1);
   }

   /* filter away potential single trailing plateu */
   pairs_end = sub(add(pairs_start,k), 1);  /* point  to last established  sign change element  */
   
   if ((sub(k, 2) >= 0) &&
      (sub(cand_pairs[sub(pairs_end,1)], cand_pairs[pairs_end]) == 0))
   {
      k = sub(k, 1);
   }
   pairs_end = sub(add(pairs_start,k), 1);  /*  recalc  ptr to last element  */


   /* conditionally add high/lows  on both sides of input (pre_dc or fin) as  candidates  */
   add_dc_flag  = 0; 
   add_fin_flag = 0; 


   if (sub(k, 1) == 0) /*  one single sign change found special case */
   {
      if (sub(inp[0], cand_pairs[pairs_start]) != 0)
      {
         add_dc_flag = 1;    /* not plateau    */
      }

      if (sub(cand_pairs[pairs_end], inp[inp_len_minus1]) != 0)
      {
         add_fin_flag = 1;     /* not plateau    */
      }
   }

   if (sub(k, 2) >= 0)
   {
      delta_predc = sub(cand_pairs[pairs_start + 1], cand_pairs[pairs_start]);
      delta_fin   = sub(cand_pairs[pairs_end], cand_pairs[pairs_end - 1]);

      /* plateaus are allowed to be detected by xor sign change,
         but still not allowed at the start nor  at the end */

      add_dc_flag = 1;   
      if (sub(inp[0], cand_pairs[pairs_start]) == 0)
      {
         add_dc_flag = 0;      /* plateau down or , plateus up., --> do not add DC  */
      }

      
      if ((sub(inp[0], cand_pairs[pairs_start]) < 0) && (delta_predc > 0))
      {
         add_dc_flag = -1;    /*UP - up    ... replace */
      }
      
      if ((sub(inp[0], cand_pairs[pairs_start]) > 0) && (delta_predc < 0))
      {
         add_dc_flag = -1;      /* DOWN - down ... % replace */
      }

      add_fin_flag = 1;        
      if (sub(cand_pairs[pairs_end], inp[inp_len_minus1]) == 0)
      {
         add_fin_flag = 0;      /* up - plateau ... */
      }
      
      if ((delta_fin > 0) && (sub(cand_pairs[pairs_end], inp[inp_len_minus1]) < 0))
      {
         add_fin_flag = -1;      /* up - UP ...    % replace , hard to hit  */
      }
      
      if ((delta_fin < 0) && (sub(cand_pairs[pairs_end], inp[inp_len_minus1]) > 0))
      {
         add_fin_flag = -1;    /*down - DOWN ... % replace */
      }

   }

   if (add_dc_flag > 0)
   {  /* add DC */
      pairs_start = sub(pairs_start, 1);
      cand_pairs[pairs_start] = inp[0]; 
      sc_idx[pairs_start] = 0; 
      ASSERT_LC3(pairs_start >= 0 && pairs_start <= 2);
      k = add(k, 1);
   }
   if (add_dc_flag < 0)
   { /*   -1 -->  replace with DC*/
      cand_pairs[pairs_start] = inp[0]; 
      sc_idx[pairs_start] = 0; 
      ASSERT_LC3(pairs_start >=0 && pairs_start <= 2);
   }

   if (add_fin_flag > 0)
   {  /* add FS/2  */
      pairs_end = add(pairs_end, 1);
      cand_pairs[pairs_end] = inp[inp_len_minus1]; 
      sc_idx[pairs_end] = inp_len_minus1; 
      k = add(k, 1);
   }
   if (add_fin_flag < 0)
   {  /*    -1, replace tail with FS/2*/
      cand_pairs[pairs_end] = inp[inp_len_minus1]; 
      sc_idx[pairs_end] = inp_len_minus1; 
   }
   /* preliminary cand_pairs now only have  highs , lows , no initial/trailing plateaus */


   /*  we allow the  DC/FsBy2 lows to be used as the candidatelLow  */
   low_val_cand_pairs = inp_low;   
   val_range          = sub( inp_high, low_val_cand_pairs); /* used to determine if search is useful at all */

   
   if ((sub(val_range, RES_fx) < 0) ||
      (sub( inp_high, sens) < 0))
   {
      k = 0;   
   }

   
   if ((k == 0) && (sub(val_range, sens) >= 0))
   {
      k = 1;  
   }


   if (sub(k, 2) > 0)
   {
      /*  low, high, low, ... or 
          high, low, high, ...*/

      cand_phase_start = pairs_start;       /*assume first candidate   is a high */
      if (sub(cand_pairs[pairs_start], cand_pairs[pairs_start + 1]) < 0)
      {
         cand_phase_start = add(pairs_start, 1);     /* first is a low, --> skip to next higher cand  */
      }

      /*  high, low, high, ... */
      tmp = k;   
      if (sub(cand_phase_start, pairs_start) != 0)
      {
         tmp = sub(tmp, 1);
      }
      num_pairs     = shr(tmp, 1);
      n_tail_values = sub(tmp, shl(num_pairs, 1));

      /* filter  preliminary  sign changes into sensitivity filtered sign changes */

      *n_fsc    = 0;                        /*   counter of  filtered fsc_idx */
      cand_high = low_val_cand_pairs;      
      cand_idx  = -1;                       /*  sentinel location for no high cand found yet. */
      cand_pairs[-1] = low_val_cand_pairs; 

      prev_low           = low_val_cand_pairs;    
      prev_low_plus_sens = add(prev_low, sens);

      /* filter loop for   high - low sign change pairs */
      /* idx_high, idx_low are raw pointers into the  cand_pairs and sc_idx arrays */
      
      for( idx_high = cand_phase_start;  idx_high < (cand_phase_start + 2 * num_pairs); idx_high += 2)
      {
         idx_low  = idx_high+1;  /* loop ptr increase */

         /* new high candidate  larger than previous candidate  and   */
         /* sensitivity still larger  than the the previous low */
         tmp = max(cand_high, prev_low_plus_sens);
         if(sub(cand_pairs[idx_high], tmp) > 0)
         {
            cand_idx  = idx_high;                 /*   enable or shift candidate position fwd */
         }
         cand_high = cand_pairs[cand_idx];    /* NB, cand_pairs[-1] , has the low_val_cand_pairs value  stored */
           
         /* now check the fwd  idx_low  of the current  {high,low} pair  */
         prev_low = min(cand_pairs[idx_low], prev_low);

         tmp = sub(cand_high, sens);
         if (sub(tmp, cand_pairs[idx_low]) > 0)
         {
            /*  this low  point is now low enough to fix a previous high candidate */

            fsc_idx[*n_fsc]      = cand_idx;    /*%  add cand high idx  -> output idx list*/
            *n_fsc               = add(*n_fsc, 1);

            prev_low = cand_pairs[idx_low];     /*  use this value  as new low estimate */
            cand_idx = -1;                     /*   no  candidate until next pair or tail  bin, and pt to lowVal */
            cand_high = low_val_cand_pairs;    /*  enable next candidate to be selected immediately  */
         }
         prev_low_plus_sens = add(prev_low, sens);
      } /* { high, low} for loop */

      
      if ((n_tail_values == 0) && (cand_idx >= 0))
      {
         /*  no tail  low or high value  to analyze
             still may need to lock a non-locked but qualified candidate */
         fsc_idx[*n_fsc]      = cand_idx;  
         *n_fsc               = add(*n_fsc, 1);
      }


      /* cand_pairs vector may have a last orphan value */
      if (n_tail_values > 0)
      {
        /*   cand_pairs vector may have a last orphan tail value */
        /*
         logic boils down to   if (nTailValues > 0) && (cand_pairs(n_end) > tmp)
          there is a last  one  trailing high to process

         a) the last high, may be a new high Peak if we have not yet
            locked  the current candidate
         b) if we have locked the last candidate, the last high may also be
            a highpeak if it is high enough from the(newly set previous) valley floor.

           tmp=a||b
        */

         tmp = max(cand_high, prev_low_plus_sens);
         tmp = sub(cand_pairs[pairs_end], tmp);
         if (tmp > 0)
         {
            fsc_idx[*n_fsc]      = pairs_end;            
            *n_fsc               = add(*n_fsc, 1);
         }
         else
         {
            if (cand_idx >= 0)
            { /* we have a previously established high candidate */
               fsc_idx[*n_fsc] = cand_idx;   
               *n_fsc          = add(*n_fsc, 1);
            }

         }
      }
      /* move high locations info from  fsc_idx , to output  */
      for(j = 0; j < *n_fsc; j++)
      { 
         ASSERT_LC3(fsc_idx[j] >= 0 && fsc_idx[j] < (inp_len+2));
         int_plocs[j] = sc_idx[fsc_idx[j]];     /*  the indirect moves  are  calculated */
      }

   } /* end of  pairs + [tail] section filtering  */
   else
   {
      /* constant/single  rise or constant decay or very low overall values,   cases */
      *n_fsc = 0;  
   
      
      tmp = sub(inp_high, sens);
      if ((k != 0) && (sub(tmp, low_val_cand_pairs) > 0))
      {
         /*      low,high */
         /*      high,low */
         tmp          = plc_phEcu_find_ind(inp, inp_len, inp_high);  
         int_plocs[0] = tmp;    /*  simply  locate the   high peak*/
         *n_fsc       = 1;     
         if (tmp < 0)
         {  /*safety in case max value index was not found */
            *n_fsc = 0; 
         }
      }
   }   
}

